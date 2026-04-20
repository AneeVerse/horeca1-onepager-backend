require("dotenv").config();
const stripe = require("stripe");
const Razorpay = require("razorpay");
const MailChecker = require("mailchecker");
// const stripe = require("stripe")(`${process.env.STRIPE_KEY}` || null); /// use hardcoded key if env not work

const mongoose = require("mongoose");
const fs = require("fs");

const Order = require("../models/Order");
const Product = require("../models/Product");
const Setting = require("../models/Setting");
const PendingPayment = require("../models/PendingPayment");
const { sendEmail, sendEmailAsync } = require("../lib/email-sender/sender");
const { formatAmountForStripe } = require("../lib/stripe/stripe");
const { handleCreateInvoice } = require("../lib/email-sender/create");
const { handleProductQuantity } = require("../lib/stock-controller/others");
const { verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } = require("../lib/razorpay/verify");
const customerInvoiceEmailBody = require("../lib/email-sender/templates/order-to-customer");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Look up Razorpay credentials (DB first, then env fallback)
const getRazorpayCredentials = async () => {
  const storeSetting = await Setting.findOne({ name: "storeSetting" });
  const key_id = storeSetting?.setting?.razorpay_id || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_ID;
  const key_secret = storeSetting?.setting?.razorpay_secret || process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
  return { key_id, key_secret };
};

// Compute cart totals (GST, taxable, product savings) — extracted so addOrder,
// addRazorpayOrder and the webhook-triggered creation all use identical math.
const computeCartTotals = async (cart) => {
  let totalGst = 0;
  let itemsTotalGross = 0;
  let productSavings = 0;
  let totalTaxableAmount = 0;

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return { totalGst, itemsTotalGross, productSavings, totalTaxableAmount, stockError: null };
  }

  // Stock validation in one query
  const cartProductIds = cart.map((item) => item._id).filter(Boolean);
  const dbProducts = await Product.find({ _id: { $in: cartProductIds } }).lean();
  const productMap = dbProducts.reduce((acc, product) => {
    acc[product._id.toString()] = product;
    return acc;
  }, {});

  for (const item of cart) {
    const product = productMap[(item._id || "").toString()];
    if (!product) {
      return { stockError: { code: 404, message: `Product ${item.title} not found!` } };
    }
    if (product.stock < item.quantity) {
      return {
        stockError: {
          code: 400,
          message: `Insufficient stock for ${item.title}! Available: ${product.stock}, Requested: ${item.quantity}`,
        },
      };
    }
  }

  cart.forEach((item) => {
    const quantity = item.quantity || 1;
    const taxPercent = parseFloat(item.taxPercent) || 0;
    const currentPrice = parseFloat(item.price) || 0;
    const originalPrice = parseFloat(
      item.originalPrice || item.prices?.originalPrice || item.prices?.price || currentPrice
    );

    const itemCurrentGross = currentPrice * quantity;
    const itemOriginalGross = originalPrice * quantity;

    const itemTaxableRate = parseFloat(item.taxableRate);
    let taxable, gst;
    if (itemTaxableRate && itemTaxableRate > 0) {
      taxable = itemTaxableRate * quantity;
      gst = itemCurrentGross - taxable;
    } else {
      taxable = itemCurrentGross / (1 + taxPercent / 100);
      gst = itemCurrentGross - taxable;
    }

    itemsTotalGross += itemCurrentGross;
    totalTaxableAmount += taxable;
    totalGst += gst;
    productSavings += Math.max(0, itemOriginalGross - itemCurrentGross);
  });

  return { totalGst, itemsTotalGross, productSavings, totalTaxableAmount, stockError: null };
};

// Validate the delivery address on the server — never trust the client.
// Returns an Error with statusCode, or null if valid.
const validateDeliveryAddress = (orderInfo) => {
  const ui = orderInfo?.user_info || {};
  const name = (ui.name || "").toString().trim();
  const address = (ui.address || "").toString().trim();
  const city = (ui.city || "").toString().trim();
  const zipCode = (ui.zipCode || "").toString().trim();

  if (!name || !address || !city || !/^\d{6}$/.test(zipCode)) {
    const err = new Error(
      "Delivery address is incomplete. Name, address, city and a 6-digit PIN code are required."
    );
    err.statusCode = 400;
    return err;
  }
  return null;
};

// Core order-creation helper shared by handler + webhook recovery.
// Guarantees idempotency: if an Order already exists for the given razorpayPaymentId,
// that existing order is returned instead of creating a duplicate.
const createOrderFromPayload = async ({ userId, orderInfo, razorpay }) => {
  // Idempotency guard — most important safety check
  if (razorpay?.razorpayPaymentId) {
    const existing = await Order.findOne({
      "razorpay.razorpayPaymentId": razorpay.razorpayPaymentId,
    });
    if (existing) {
      console.log("[createOrderFromPayload] Order already exists for paymentId:", razorpay.razorpayPaymentId);
      return { order: existing, created: false };
    }
  }

  // Server-side address validation — even the webhook recovery path goes
  // through here, so a corrupt PendingPayment record can't create an order
  // with no address.
  const addressError = validateDeliveryAddress(orderInfo);
  if (addressError) throw addressError;

  const { totalGst, productSavings, totalTaxableAmount, stockError } = await computeCartTotals(orderInfo.cart);
  if (stockError) {
    const err = new Error(stockError.message);
    err.statusCode = stockError.code;
    throw err;
  }

  const lastOrder = await Order.findOne({}).sort({ invoice: -1 }).select("invoice").lean();
  const nextInvoice = lastOrder ? lastOrder.invoice + 1 : 10000;

  const finalGst = orderInfo.totalGst !== undefined ? parseFloat(orderInfo.totalGst) : totalGst;
  const finalTaxable =
    orderInfo.taxableSubtotal !== undefined ? parseFloat(orderInfo.taxableSubtotal) : totalTaxableAmount;
  const couponDiscount = parseFloat(orderInfo.discount) || 0;
  const totalDiscount = productSavings + couponDiscount;

  const newOrder = new Order({
    ...orderInfo,
    user: userId,
    invoice: nextInvoice,
    totalGst: finalGst,
    taxableSubtotal: finalTaxable,
    discount: totalDiscount,
    vat: finalGst,
    razorpay: razorpay || orderInfo.razorpay,
  });

  const order = await newOrder.save();

  // Await the stock decrement so we can detect a lost race (two concurrent
  // orders both passing the stock check, but only one getting the last unit).
  // Each decrement is atomic with a `stock >= qty` guard, so if any item
  // didn't match we know stock was stolen between check and decrement.
  const stockResult = await handleProductQuantity(order.cart);
  if (!stockResult.success) {
    const failed = (stockResult.failedItems || [])
      .map((f) => `${f.title} (requested ${f.requested}, available ${f.available ?? 0})`)
      .join(", ");

    if (razorpay?.razorpayPaymentId) {
      // Money was already captured by Razorpay — we cannot simply delete the
      // order. Flag it so an admin can issue a refund or restock manually.
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            status: "refund_required",
            stockFailure: {
              failedItems: stockResult.failedItems,
              note: "Payment captured but stock was unavailable. Admin must refund or restock.",
              flaggedAt: new Date(),
            },
          },
        }
      );
      console.error(
        `[createOrderFromPayload] Order ${order._id} created but stock unavailable: ${failed}. Flagged for admin refund.`
      );
      const err = new Error(
        "Your payment was received, but one or more items sold out while checking out. Our team will contact you for a refund shortly."
      );
      err.statusCode = 409;
      throw err;
    }

    // Unpaid order (e.g. COD) — safe to roll back.
    await Order.deleteOne({ _id: order._id });
    const err = new Error(
      `Sorry, these items just sold out: ${failed}. Please update your cart and try again.`
    );
    err.statusCode = 409;
    throw err;
  }

  return { order, created: true };
};

const addOrder = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).send({ message: "Authentication required" });
    }
    const { order } = await createOrderFromPayload({
      userId: req.user._id,
      orderInfo: req.body,
      razorpay: req.body.razorpay,
    });
    res.status(201).send(order);
  } catch (err) {
    console.error("[addOrder] Error:", err.message);
    res.status(err.statusCode || 500).send({ message: err.message });
  }
};

//create payment intent for stripe
const createPaymentIntent = async (req, res) => {
  const { total: amount, cardInfo: payment_intent, email } = req.body;
  // console.log("req.body", req.body);
  // Validate the amount that was passed from the client.
  if (!(amount >= process.env.MIN_AMOUNT && amount <= process.env.MAX_AMOUNT)) {
    return res.status(500).json({ message: "Invalid amount." });
  }
  const storeSetting = await Setting.findOne({ name: "storeSetting" });
  const stripeSecret = storeSetting?.setting?.stripe_secret;
  const stripeInstance = stripe(stripeSecret);
  if (payment_intent.id) {
    try {
      const current_intent = await stripeInstance.paymentIntents.retrieve(
        payment_intent.id
      );
      // If PaymentIntent has been created, just update the amount.
      if (current_intent) {
        const updated_intent = await stripeInstance.paymentIntents.update(
          payment_intent.id,
          {
            amount: formatAmountForStripe(amount, "usd"),
          }
        );
        // console.log("updated_intent", updated_intent);
        return res.send(updated_intent);
      }
    } catch (err) {
      // console.log("error", err);

      if (err.code !== "resource_missing") {
        const errorMessage =
          err instanceof Error ? err.message : "Internal server error";
        return res.status(500).send({ message: errorMessage });
      }
    }
  }
  try {
    // Create PaymentIntent from body params.
    const params = {
      amount: formatAmountForStripe(amount, "usd"),
      currency: "usd",
      description: process.env.STRIPE_PAYMENT_DESCRIPTION || "",
      automatic_payment_methods: {
        enabled: true,
      },
    };
    const payment_intent = await stripeInstance.paymentIntents.create(params);
    // console.log("payment_intent", payment_intent);

    res.send(payment_intent);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    res.status(500).send({ message: errorMessage });
  }
};

const createOrderByRazorPay = async (req, res) => {
  try {
    const incomingAmount = req.body?.amount;
    const amountInRupees = Number(incomingAmount);
    const amountInPaise = Math.round(amountInRupees * 100);

    console.log("[Razorpay] ========== Order Creation Start ==========");
    console.log("[Razorpay] Incoming amount (rupees):", incomingAmount);
    console.log("[Razorpay] Authenticated user ID:", req.user?._id || "anonymous");

    if (!amountInPaise || amountInPaise < 100) {
      return res.status(400).send({ message: "Invalid amount" });
    }

    const { key_id, key_secret } = await getRazorpayCredentials();
    if (!key_id || !key_secret) {
      console.error("[Razorpay] ERROR: Razorpay credentials missing");
      return res.status(500).send({
        message: "Razorpay configuration is missing. Please contact administrator.",
      });
    }

    const instance = new Razorpay({ key_id, key_secret });

    // Build receipt + notes so the payment is traceable inside Razorpay itself
    // even if every other safety layer fails.
    const userId = req.user?._id || null;
    const userInfo = req.body?.orderInfo?.user_info || {};
    const cart = req.body?.orderInfo?.cart || [];
    const receipt = `rcpt_${userId || "anon"}_${Date.now()}`.slice(0, 40);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: {
        userId: userId ? userId.toString() : "",
        phone: (userInfo.contact || "").toString().slice(0, 40),
        email: (userInfo.email || "").toString().slice(0, 60),
        name: (userInfo.name || "").toString().slice(0, 60),
        itemCount: String(cart.length || 0),
        totalRupees: String(amountInRupees),
      },
    };

    console.log("[Razorpay] Creating Razorpay order with receipt:", receipt);
    const rzpOrder = await instance.orders.create(options);

    if (!rzpOrder) {
      return res.status(500).send({ message: "Error occurred when creating order!" });
    }

    // LAYER 2 SAFETY NET: save a PendingPayment record BEFORE the user ever sees
    // the checkout modal. Status = "created". If anything downstream dies —
    // browser crash, token expiry, network drop — this record lets us recover
    // the order from the Razorpay webhook using just razorpayOrderId.
    // This is the most important change: the safety net now runs BEFORE money moves.
    if (req.body?.orderInfo) {
      try {
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId: rzpOrder.id },
          {
            razorpayOrderId: rzpOrder.id,
            amount: amountInRupees,
            userId: userId,
            orderInfo: req.body.orderInfo,
            status: "created",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log("[Razorpay] Pre-payment safety net saved:", rzpOrder.id);
      } catch (pendingErr) {
        // Do NOT fail the checkout on safety-net save failure — just warn loudly.
        console.error("[Razorpay] WARNING: Could not save pre-payment safety net:", pendingErr.message);
      }
    }

    console.log("[Razorpay] Order created:", rzpOrder.id, "amount:", rzpOrder.amount);
    console.log("[Razorpay] ========== Order Creation End ==========");
    res.send(rzpOrder);
  } catch (err) {
    console.error("[Razorpay] ERROR in createOrderByRazorPay:", err.message);
    console.error("[Razorpay] Error stack:", err.stack);
    res.status(500).send({ message: err.message });
  }
};

const addRazorpayOrder = async (req, res) => {
  console.log("[Razorpay] ========== Add Order Start ==========");
  const razorpayPaymentId = req.body?.razorpay?.razorpayPaymentId;
  const razorpayOrderId = req.body?.razorpay?.razorpayOrderId;
  const razorpaySignature = req.body?.razorpay?.razorpaySignature;
  console.log("[Razorpay] paymentId:", razorpayPaymentId, "orderId:", razorpayOrderId);
  console.log("[Razorpay] Authed user:", req.user?._id || "anonymous (safety mode)");

  try {
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).send({ message: "Missing Razorpay payment details" });
    }

    // SECURITY: verify Razorpay signature before trusting any payment data.
    // Without this check anyone with a token could post fake paymentIds and
    // mark orders as paid.
    const { key_secret } = await getRazorpayCredentials();
    if (!key_secret) {
      return res.status(500).send({ message: "Razorpay configuration missing" });
    }
    const signatureOk = verifyRazorpayPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      key_secret
    );
    if (!signatureOk) {
      console.error("[Razorpay] CRITICAL: Signature verification FAILED for paymentId:", razorpayPaymentId);
      return res.status(400).send({ message: "Invalid payment signature" });
    }

    // IDEMPOTENCY: if an order already exists for this paymentId, return it.
    // This prevents duplicate orders when both the handler AND the webhook
    // try to create the same order (which is normal and expected).
    const existingOrder = await Order.findOne({
      "razorpay.razorpayPaymentId": razorpayPaymentId,
    });
    if (existingOrder) {
      console.log("[Razorpay] Order already exists, returning existing:", existingOrder._id);
      // Still mark pending payment as recovered
      await PendingPayment.findOneAndUpdate(
        { razorpayOrderId },
        { status: "recovered", recoveredOrderId: existingOrder._id, razorpayPaymentId }
      );
      return res.status(200).send(existingOrder);
    }

    // Determine user: prefer req.user (token still valid), else fall back to
    // the PendingPayment record (saved earlier when user WAS authenticated).
    let userId = req.user?._id;
    let pending = null;
    if (!userId) {
      pending = await PendingPayment.findOne({ razorpayOrderId });
      userId = pending?.userId;
      console.log("[Razorpay] Recovered user from PendingPayment:", userId);
    }
    if (!userId) {
      console.error("[Razorpay] CRITICAL: Cannot determine user for paymentId:", razorpayPaymentId);
      // Save to pending payments anyway so admin can recover manually
      await PendingPayment.findOneAndUpdate(
        { razorpayOrderId },
        {
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: parseFloat(req.body.total) || 0,
          orderInfo: req.body,
          status: "failed",
          error: "Cannot determine user (token expired and no PendingPayment record)",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return res.status(401).send({
        message: "Session expired. Your payment is safe and will be processed shortly.",
      });
    }

    // Build order payload — use the PendingPayment orderInfo as source of truth
    // if it exists (most reliable: saved while user was authenticated).
    const orderInfoSource = pending?.orderInfo || req.body;
    const { order } = await createOrderFromPayload({
      userId,
      orderInfo: orderInfoSource,
      razorpay: {
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
        amount: parseFloat(req.body.total) || pending?.amount || 0,
      },
    });

    console.log("[Razorpay] Order created:", order._id, "invoice:", order.invoice);

    // Mark pending payment as recovered
    await PendingPayment.findOneAndUpdate(
      { razorpayOrderId },
      {
        status: "recovered",
        razorpayPaymentId,
        razorpaySignature,
        recoveredOrderId: order._id,
      }
    );

    return res.status(201).send(order);
  } catch (err) {
    console.error("[Razorpay] ========== Order Creation Failed ==========");
    console.error("[Razorpay] Error:", err.message);
    console.error("[Razorpay] Stack:", err.stack);

    // Preserve the failed payment for admin recovery
    if (razorpayOrderId) {
      try {
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId },
          {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            amount: parseFloat(req.body.total) || 0,
            orderInfo: req.body,
            status: "failed",
            error: err.message,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.error("[Razorpay] Saved failed order to PendingPayment for recovery");
      } catch (pendingErr) {
        console.error("[Razorpay] Could not save to PendingPayment:", pendingErr.message);
      }
    }

    return res.status(err.statusCode || 500).send({ message: err.message });
  }
};

// ---------------------------------------------------------------------------
// Razorpay webhook — the ultimate safety net.
// Razorpay calls this endpoint server-to-server when a payment is captured,
// even if the browser died, lost connection, or the token expired.
// Must be mounted with express.raw() so we can verify the signature.
// ---------------------------------------------------------------------------
const razorpayWebhook = async (req, res) => {
  console.log("[Webhook] ========== Razorpay webhook received ==========");
  try {
    const signature = req.headers["x-razorpay-signature"];
    // Prefer the raw body captured by express.raw(); fall back to stringifying req.body.
    const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET not set — refusing webhook");
      return res.status(500).send({ message: "Webhook secret not configured" });
    }

    const signatureOk = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
    if (!signatureOk) {
      console.error("[Webhook] Invalid webhook signature");
      return res.status(400).send({ message: "Invalid webhook signature" });
    }

    // Parse body (may still be a Buffer if express.raw() was used)
    const payload = typeof req.body === "string" || Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
    const event = payload.event;
    console.log("[Webhook] Event:", event);

    // We care about payment.captured and order.paid. Both give us orderId + paymentId.
    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const orderEntity = payload.payload?.order?.entity || {};
      const razorpayPaymentId = paymentEntity.id;
      const razorpayOrderId = paymentEntity.order_id || orderEntity.id;
      const amount = (paymentEntity.amount || orderEntity.amount || 0) / 100;

      console.log("[Webhook] paymentId:", razorpayPaymentId, "orderId:", razorpayOrderId);

      if (!razorpayOrderId || !razorpayPaymentId) {
        console.error("[Webhook] Missing orderId or paymentId in payload");
        return res.status(200).send({ ok: true }); // ack anyway to prevent retries
      }

      // Idempotency: if Order already exists, acknowledge and exit.
      const existingOrder = await Order.findOne({
        "razorpay.razorpayPaymentId": razorpayPaymentId,
      });
      if (existingOrder) {
        console.log("[Webhook] Order already exists:", existingOrder._id);
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId },
          { status: "recovered", razorpayPaymentId, recoveredOrderId: existingOrder._id }
        );
        return res.status(200).send({ ok: true, orderId: existingOrder._id });
      }

      // Look up the PendingPayment record that was saved before the modal opened.
      const pending = await PendingPayment.findOne({ razorpayOrderId });
      if (!pending) {
        console.error("[Webhook] No PendingPayment found for orderId:", razorpayOrderId);
        // Save a bare record so admin can investigate manually.
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId },
          {
            razorpayOrderId,
            razorpayPaymentId,
            amount,
            orderInfo: { webhook: true, notes: paymentEntity.notes || {} },
            status: "failed",
            error: "No PendingPayment record — order info unavailable. Check Razorpay notes for userId.",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return res.status(200).send({ ok: true, warning: "no pending record" });
      }

      // Recreate the order from the pending payment's saved orderInfo
      try {
        const { order } = await createOrderFromPayload({
          userId: pending.userId,
          orderInfo: pending.orderInfo,
          razorpay: {
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature: pending.razorpaySignature || "",
            amount,
          },
        });
        console.log("[Webhook] Order created from pending payment:", order._id, "invoice:", order.invoice);

        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId },
          {
            status: "recovered",
            razorpayPaymentId,
            recoveredOrderId: order._id,
            notes: `Recovered via webhook event=${event}`,
          }
        );
        return res.status(200).send({ ok: true, orderId: order._id, invoice: order.invoice });
      } catch (recoverErr) {
        console.error("[Webhook] Order creation from pending failed:", recoverErr.message);
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId },
          {
            status: "failed",
            razorpayPaymentId,
            error: `Webhook recovery failed: ${recoverErr.message}`,
            $inc: { recoveryAttempts: 1 },
            lastRecoveryAttemptAt: new Date(),
          }
        );
        // Still 200 so Razorpay doesn't retry indefinitely
        return res.status(200).send({ ok: false, error: recoverErr.message });
      }
    }

    // Unhandled event — just ack
    return res.status(200).send({ ok: true, ignored: event });
  } catch (err) {
    console.error("[Webhook] Unhandled error:", err.message);
    // Return 200 to avoid Razorpay retry storm; we've logged it.
    return res.status(200).send({ ok: false, error: err.message });
  }
};

// get all orders user
const getOrderCustomer = async (req, res) => {
  try {
    // console.log("getOrderCustomer", req.user);
    const { page, limit } = req.query;

    const pages = Number(page) || 1;
    const limits = Number(limit) || 8;
    const skip = (pages - 1) * limits;

    const userId = new mongoose.Types.ObjectId(req.user._id);

    const totalDoc = await Order.countDocuments({ user: userId });

    // total padding order count
    const totalPendingOrder = await Order.aggregate([
      {
        $match: {
          status: { $regex: `pending`, $options: "i" },
          user: userId,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    // total padding order count
    const totalProcessingOrder = await Order.aggregate([
      {
        $match: {
          status: { $regex: `processing`, $options: "i" },
          user: userId,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const totalDeliveredOrder = await Order.aggregate([
      {
        $match: {
          status: { $regex: `delivered`, $options: "i" },
          user: userId,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    // today order amount

    // query for orders
    const orders = await Order.find({ user: req.user._id })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limits);

    res.send({
      orders,
      limits,
      pages,
      pending: totalPendingOrder.length === 0 ? 0 : totalPendingOrder[0].count,
      processing:
        totalProcessingOrder.length === 0 ? 0 : totalProcessingOrder[0].count,
      delivered:
        totalDeliveredOrder.length === 0 ? 0 : totalDeliveredOrder[0].count,

      totalDoc,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getOrderById = async (req, res) => {
  try {
    // console.log("getOrderById");
    const order = await Order.findById(req.params.id);
    res.send(order);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const sendEmailInvoiceToCustomer = async (req, res) => {
  try {
    const user = req.body.user_info;
    const pdf = await handleCreateInvoice(req.body, `${req.body.invoice}.pdf`);

    const option = {
      date: req.body.date,
      invoice: req.body.invoice,
      status: req.body.status,
      method: req.body.paymentMethod,
      subTotal: req.body.subTotal,
      total: req.body.total,
      discount: req.body.discount,
      shipping: req.body.shippingCost,
      totalGst: req.body.totalGst,
      taxableSubtotal: req.body.taxableSubtotal,
      currency: req.body.company_info.currency,
      company_name: req.body.company_info.company,
      company_address: req.body.company_info.address,
      company_phone: req.body.company_info.phone,
      company_email: req.body.company_info.email,
      company_website: req.body.company_info.website,
      vat_number: req.body?.company_info?.vat_number,
      name: user?.name,
      email: user?.email,
      phone: user?.contact || user?.phone,
      address: user?.address,
      city: user?.city,
      country: user?.country,
      zipCode: user?.zipCode,
      cart: req.body.cart,
    };

    const fromEmail = req.body.company_info?.from_email || "sales@horeca1.com";
    const ownerEmail = "team.horeca1@gmail.com";

    // Send emails asynchronously (fire and forget) to avoid blocking response in serverless
    // This is important for Vercel/serverless environments where function may timeout
    const sendEmailsPromise = (async () => {
      try {
        // Send to customer if email is valid
        if (user?.email && MailChecker.isValid(user?.email)) {
          console.log(`[Email] Sending invoice to customer: ${user.email} for order #${req.body.invoice}`);
          const customerBody = {
            from: fromEmail,
            to: user.email,
            subject: `Your Order #${req.body.invoice} - horeca1`,
            html: customerInvoiceEmailBody(option),
            attachments: [
              {
                filename: `${req.body.invoice}.pdf`,
                content: pdf,
              },
            ],
          };
          await sendEmailAsync(customerBody, `Invoice sent to customer ${user.name}`);
        } else {
          console.log(`[Email] Skipping customer email - email invalid or missing: ${user?.email}`);
        }

        // Always send to owner
        console.log(`[Email] Sending order notification to owner: ${ownerEmail} for order #${req.body.invoice}`);
        const ownerBody = {
          from: fromEmail,
          to: ownerEmail,
          subject: `New Order #${req.body.invoice} - ₹${req.body.total} from ${user?.name}`,
          html: ownerOrderNotificationEmailBody(option),
          attachments: [
            {
              filename: `${req.body.invoice}.pdf`,
              content: pdf,
            },
          ],
        };
        await sendEmailAsync(ownerBody, `Order notification sent to owner`);
      } catch (emailErr) {
        console.error(`[Email] Error sending emails for order #${req.body.invoice}:`, emailErr.message);
        // Don't throw - we don't want email failures to break the order response
      }
    })();

    // Send response immediately, don't wait for emails (fire and forget)
    res.send({
      message: "Order notification emails are being sent",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Email template for owner notification
const ownerOrderNotificationEmailBody = (option) => {
  const cartItemsHtml = option.cart?.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center;">
          <img src="${item.image}" alt="${item.title}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 12px;">
          <span>${item.title}</span>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${option.currency}${item.price?.toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${option.currency}${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Order Received</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981, #14b8a6); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 New Order Received!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Order #${option.invoice}</p>
        </div>

        <div style="padding: 30px;">
          <!-- Order Summary -->
          <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 15px; color: #166534; font-size: 18px;">Order Summary</h2>
            <div style="display: grid; gap: 8px;">
              <p style="margin: 0;"><strong>Total Amount:</strong> <span style="color: #10b981; font-size: 20px; font-weight: bold;">${option.currency}${option.total?.toFixed(2)}</span></p>
              <p style="margin: 0;"><strong>Payment Method:</strong> ${option.method}</p>
              <p style="margin: 0;"><strong>Date:</strong> ${option.date}</p>
            </div>
          </div>

          <!-- Customer Info -->
          <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px; color: #374151;">Customer Details</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${option.name}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> +91 ${option.phone}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${option.email || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Address:</strong> ${option.address}</p>
          </div>

          <!-- Order Items -->
          <h3 style="margin: 0 0 15px; color: #374151;">Order Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280;">Product</th>
                <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #6b7280;">Qty</th>
                <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6b7280;">Price</th>
                <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6b7280;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${cartItemsHtml}
            </tbody>
          </table>

          <!-- Totals -->
          <div style="background: #f9fafb; border-radius: 8px; padding: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Subtotal</span>
              <span>${option.currency}${option.subTotal?.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Shipping</span>
              <span>${option.currency}${option.shipping?.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Discount</span>
              <span style="color: #f59e0b;">-${option.currency}${option.discount?.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #e5e7eb; padding-top: 10px; font-weight: bold; font-size: 18px;">
              <span>Total</span>
              <span style="color: #10b981;">${option.currency}${option.total?.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Please process this order at your earliest convenience.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Save pending payment as a safety net. This is now a "captured" update —
// it's called from the frontend handler right after Razorpay confirms payment,
// to upgrade the record from "created" to "captured" and stamp the paymentId.
// Public endpoint (no auth) so it works even if the token expired during UPI approval.
const savePendingPayment = async (req, res) => {
  console.log("[PendingPayment] Upsert request for orderId:", req.body.razorpayOrderId);

  try {
    const razorpayOrderId = req.body.razorpayOrderId;
    if (!razorpayOrderId) {
      return res.status(400).send({ message: "razorpayOrderId is required" });
    }

    const update = {
      razorpayOrderId,
      razorpayPaymentId: req.body.razorpayPaymentId,
      razorpaySignature: req.body.razorpaySignature,
      amount: req.body.amount,
      status: "captured",
    };
    // Only overwrite orderInfo if caller provided one (don't clobber the
    // authenticated copy saved at checkout start).
    if (req.body.orderInfo) {
      update.orderInfo = req.body.orderInfo;
    }
    // Only overwrite userId if caller provided one
    if (req.body.userId) {
      update.userId = req.body.userId;
    }

    const saved = await PendingPayment.findOneAndUpdate(
      { razorpayOrderId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("[PendingPayment] Upserted:", saved._id, "status:", saved.status);
    res.status(200).send(saved);
  } catch (err) {
    console.error("[PendingPayment] Error saving:", err.message);
    res.status(500).send({ message: err.message });
  }
};

module.exports = {
  addOrder,
  getOrderById,
  getOrderCustomer,
  createPaymentIntent,
  createOrderByRazorPay,
  addRazorpayOrder,
  savePendingPayment,
  razorpayWebhook,
  sendEmailInvoiceToCustomer,
};
