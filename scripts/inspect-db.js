require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const jwt      = require("jsonwebtoken");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Admin    = require("../models/Admin");
  const Customer = require("../models/Customer");
  const Product  = require("../models/Product");
  const Order    = require("../models/Order");

  // ── Admins ───────────────────────────────────────────────
  const admins = await Admin.find({}).limit(3).lean();
  admins.forEach(a => {
    // Mint a fresh admin JWT so we can use it in tests
    const token = jwt.sign(
      { id: a._id, name: a.name, email: a.email, role: a.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    console.log("ADMIN_FOUND:", JSON.stringify({ _id: a._id, name: a.name, email: a.email, role: a.role }));
    console.log("ADMIN_TOKEN:", token);
  });

  // ── Customers ────────────────────────────────────────────
  const customers = await Customer.find({ phone: { $exists: true } }).limit(5).lean();
  customers.forEach(c => {
    const token = jwt.sign(
      { _id: c._id, name: c.name, email: c.email, phone: c.phone },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    console.log("CUSTOMER:", JSON.stringify({
      _id       : c._id,
      name      : c.name,
      phone     : c.phone,
      email     : c.email,
      addresses : c.shippingAddresses?.length || 0,
    }));
    console.log("CUSTOMER_TOKEN:", token);
  });

  // ── Products with low stock ───────────────────────────────
  const products = await Product.find({ stock: { $gt: 0 }, status: "show" })
    .sort({ stock: 1 })
    .limit(5)
    .lean();
  products.forEach(p => {
    console.log("PRODUCT:", JSON.stringify({
      _id  : p._id,
      title: p.title,
      stock: p.stock,
      price: p.prices?.price || p.price || 100,
    }));
  });

  // ── refund_required orders ───────────────────────────────
  const refundOrders = await Order.find({ status: "refund_required" }).lean();
  console.log("REFUND_REQUIRED_COUNT:", refundOrders.length);
  refundOrders.forEach(o => {
    console.log("REFUND_ORDER:", JSON.stringify({
      _id        : o._id,
      invoice    : o.invoice,
      total      : o.total,
      customer   : o.user_info?.name,
      email      : o.user_info?.email,
      rzpPayId   : o.razorpay?.razorpayPaymentId,
      rzpOrderId : o.razorpay?.razorpayOrderId,
      flaggedAt  : o.stockFailure?.flaggedAt,
      note       : o.stockFailure?.note,
      failedItems: o.stockFailure?.failedItems,
    }));
  });

  // ── Pending payments with status=failed ──────────────────
  const PendingPayment = require("../models/PendingPayment");
  const failedPP = await PendingPayment.find({ status: "failed" }).lean();
  console.log("FAILED_PENDING_PAYMENTS:", failedPP.length);
  failedPP.forEach(p => {
    console.log("FAILED_PP:", JSON.stringify({
      _id          : p._id,
      rzpOrderId   : p.razorpayOrderId,
      rzpPaymentId : p.razorpayPaymentId,
      amount       : p.amount,
      error        : p.error,
      userId       : p.userId,
    }));
  });

  mongoose.disconnect();
}).catch(e => {
  console.error("DB error:", e.message);
  process.exit(1);
});
