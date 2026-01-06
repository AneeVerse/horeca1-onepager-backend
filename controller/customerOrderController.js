require("dotenv").config();
const stripe = require("stripe");
const Razorpay = require("razorpay");
const MailChecker = require("mailchecker");
// const stripe = require("stripe")(`${process.env.STRIPE_KEY}` || null); /// use hardcoded key if env not work

const mongoose = require("mongoose");
const fs = require("fs");

const Order = require("../models/Order");
const Setting = require("../models/Setting");
const { sendEmail, sendEmailAsync } = require("../lib/email-sender/sender");
const { formatAmountForStripe } = require("../lib/stripe/stripe");
const { handleCreateInvoice } = require("../lib/email-sender/create");
const { handleProductQuantity } = require("../lib/stock-controller/others");
const customerInvoiceEmailBody = require("../lib/email-sender/templates/order-to-customer");

const addOrder = async (req, res) => {
  // console.log("addOrder", req.body);
  // console.log("req.user._id", req.user._id);

  try {
    // 1️⃣ Get the latest invoice number
    const lastOrder = await Order.findOne({})
      .sort({ invoice: -1 }) // get the order with highest invoice
      .select("invoice")
      .lean();

    const nextInvoice = lastOrder ? lastOrder.invoice + 1 : 10000; // start from 10000 if no orders

    // Calculate GST, Taxable Subtotal, and Total Discount (Product Savings + Coupon)
    let totalGst = 0;
    let itemsTotalGross = 0;
    let productSavings = 0;

    if (req.body.cart && Array.isArray(req.body.cart)) {
      req.body.cart.forEach(item => {
        const quantity = item.quantity || 1;
        const taxPercent = parseFloat(item.taxPercent) || 0;
        const currentPrice = parseFloat(item.price) || 0;
        const originalPrice = parseFloat(item.originalPrice || item.prices?.originalPrice || item.prices?.price || currentPrice);

        const itemCurrentGross = currentPrice * quantity;
        const itemOriginalGross = originalPrice * quantity;

        const taxable = itemCurrentGross / (1 + taxPercent / 100);
        const gst = itemCurrentGross - taxable;

        itemsTotalGross += itemCurrentGross;
        totalGst += gst;
        productSavings += Math.max(0, itemOriginalGross - itemCurrentGross);
      });
    }

    // Combined discount = Product savings (bulk/promo) + Coupon discount
    const couponDiscount = parseFloat(req.body.discount) || 0;
    const totalDiscount = productSavings + couponDiscount;

    const newOrder = new Order({
      ...req.body,
      user: req.user._id,
      invoice: nextInvoice,
      totalGst: totalGst,
      taxableSubtotal: itemsTotalGross - totalGst,
      discount: totalDiscount,
      vat: totalGst,
    });

    const order = await newOrder.save();
    // console.log("order", order);

    res.status(201).send(order);
    handleProductQuantity(order.cart);
  } catch (err) {
    // console.log("error", err);

    res.status(500).send({
      message: err.message,
    });
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
    const storeSetting = await Setting.findOne({ name: "storeSetting" });

    // Enhanced logging
    const incomingAmount = req.body?.amount;
    const amountInRupees = Number(incomingAmount);
    const amountInPaise = amountInRupees * 100;

    console.log("[Razorpay] ========== Order Creation Start ==========");
    console.log("[Razorpay] Incoming amount (rupees):", incomingAmount);
    console.log("[Razorpay] Parsed amount (rupees):", amountInRupees);
    console.log("[Razorpay] Converted amount (paise):", amountInPaise);
    console.log("[Razorpay] Full request body:", JSON.stringify(req.body, null, 2));

    // Get Razorpay keys from database or environment variables
    const razorpayId = storeSetting?.setting?.razorpay_id || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_ID;
    const razorpaySecret = storeSetting?.setting?.razorpay_secret || process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;

    console.log("[Razorpay] StoreSetting found:", !!storeSetting);
    console.log("[Razorpay] Razorpay ID from DB:", storeSetting?.setting?.razorpay_id ? "Present" : "Missing");
    console.log("[Razorpay] Razorpay Secret from DB:", storeSetting?.setting?.razorpay_secret ? "Present" : "Missing");
    console.log("[Razorpay] Razorpay ID (final):", razorpayId ? "Present" : "MISSING");
    console.log("[Razorpay] Razorpay Secret (final):", razorpaySecret ? "Present" : "MISSING");

    if (!razorpayId || !razorpaySecret) {
      console.error("[Razorpay] ERROR: Razorpay credentials are missing!");
      console.error("[Razorpay] Please ensure Razorpay keys are set in database or environment variables");
      return res.status(500).send({
        message: "Razorpay configuration is missing. Please contact administrator.",
      });
    }

    const instance = new Razorpay({
      key_id: razorpayId,
      key_secret: razorpaySecret,
    });

    const options = {
      amount: amountInPaise,
      currency: "INR",
    };

    console.log("[Razorpay] Options sent to Razorpay API:", JSON.stringify(options, null, 2));

    const order = await instance.orders.create(options);

    if (!order) {
      console.log("[Razorpay] ERROR: Order creation returned null/undefined");
      return res.status(500).send({
        message: "Error occurred when creating order!",
      });
    }

    console.log("[Razorpay] Order created successfully:");
    console.log("[Razorpay] Order ID:", order.id);
    console.log("[Razorpay] Order Amount (paise):", order.amount);
    console.log("[Razorpay] Order Amount (rupees):", order.amount / 100);
    console.log("[Razorpay] Order Currency:", order.currency);
    console.log("[Razorpay] Full order response:", JSON.stringify(order, null, 2));
    console.log("[Razorpay] ========== Order Creation End ==========");

    res.send(order);
  } catch (err) {
    console.log("[Razorpay] ERROR in createOrderByRazorPay:", err.message);
    console.log("[Razorpay] Error stack:", err.stack);
    res.status(500).send({
      message: err.message,
    });
  }
};

const addRazorpayOrder = async (req, res) => {
  try {
    // Log cart items structure to verify product details are included
    const cartItemsDebug = req.body.cart?.map(item => ({
      id: item.id,
      title: item.title,
      sku: item.sku,
      hsn: item.hsn,
      unit: item.unit,
      brand: item.brand,
      price: item.price,
      quantity: item.quantity,
    })) || [];
    console.log("[Razorpay] Cart items in order:", cartItemsDebug);

    // Generate invoice number (same logic as addOrder)
    const lastOrder = await Order.findOne({})
      .sort({ invoice: -1 }) // get the order with highest invoice
      .select("invoice")
      .lean();

    const nextInvoice = lastOrder ? lastOrder.invoice + 1 : 10000; // start from 10000 if no orders

    // Calculate GST, Taxable Subtotal, and Total Discount (Product Savings + Coupon)
    let totalGst = 0;
    let itemsTotalGross = 0;
    let productSavings = 0;

    if (req.body.cart && Array.isArray(req.body.cart)) {
      req.body.cart.forEach(item => {
        const quantity = item.quantity || 1;
        const taxPercent = parseFloat(item.taxPercent) || 0;
        const currentPrice = parseFloat(item.price) || 0;
        const originalPrice = parseFloat(item.originalPrice || item.prices?.originalPrice || item.prices?.price || currentPrice);

        const itemCurrentGross = currentPrice * quantity;
        const itemOriginalGross = originalPrice * quantity;

        const taxable = itemCurrentGross / (1 + taxPercent / 100);
        const gst = itemCurrentGross - taxable;

        itemsTotalGross += itemCurrentGross;
        totalGst += gst;
        productSavings += Math.max(0, itemOriginalGross - itemCurrentGross);
      });
    }

    // Combined discount = Product savings (bulk/promo) + Coupon discount
    const couponDiscount = parseFloat(req.body.discount) || 0;
    const totalDiscount = productSavings + couponDiscount;

    const newOrder = new Order({
      ...req.body,
      user: req.user._id,
      invoice: nextInvoice,
      totalGst: totalGst,
      taxableSubtotal: itemsTotalGross - totalGst,
      discount: totalDiscount,
      vat: totalGst,
    });
    const order = await newOrder.save();
    console.log("[Razorpay] Order saved:", {
      id: order._id,
      invoice: order.invoice,
      total: order.total,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      status: order.status,
      cartItemsCount: order.cart?.length,
    });
    res.status(201).send(order);
    handleProductQuantity(order.cart);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
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

module.exports = {
  addOrder,
  getOrderById,
  getOrderCustomer,
  createPaymentIntent,
  createOrderByRazorPay,
  addRazorpayOrder,
  sendEmailInvoiceToCustomer,
};
