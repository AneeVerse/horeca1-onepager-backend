const express = require("express");
const router = express.Router();
const {
  addOrder,
  getOrderById,
  getOrderCustomer,
  createPaymentIntent,
  addRazorpayOrder,
  createOrderByRazorPay,
  savePendingPayment,
  razorpayWebhook,
  sendEmailInvoiceToCustomer,
} = require("../controller/customerOrderController");

const { isAuth, optionalAuth } = require("../config/auth");
const { emailVerificationLimit } = require("../lib/email-sender/sender");

// -------------------- PUBLIC PAYMENT SAFETY-NET ROUTES --------------------
// These routes are PUBLIC (no isAuth) on purpose. If a customer's JWT expires
// during the UPI approval window (3–10 min), rejecting these would cause the
// payment to be captured in Razorpay but lost in our system. Instead, we
// accept the request, verify it via Razorpay signature / webhook secret, and
// fall back to the PendingPayment record (saved while user was authenticated)
// to identify the user.
//
// Razorpay webhook — verified by HMAC-SHA256 signature header.
// req.rawBody is captured in api/index.js by the express.json() verify hook.
router.post("/razorpay/webhook", razorpayWebhook);

// Pending-payment safety net — must work even if token expired.
// Verified via signature check downstream (signature is present in payload).
router.post("/pending-payment", optionalAuth, savePendingPayment);

// Add-order after Razorpay capture — PUBLIC on purpose.
// Signature verification + user lookup from PendingPayment provides the security.
router.post("/add/razorpay", optionalAuth, addRazorpayOrder);

// -------------------- AUTHED ROUTES --------------------
// Create Razorpay order — authed. At checkout start the token is always valid,
// and we need req.user._id to save the initial PendingPayment record.
router.post("/create/razorpay", isAuth, createOrderByRazorPay);

// Create Stripe payment intent — authed.
router.post("/create-payment-intent", isAuth, createPaymentIntent);

// Add COD/Stripe order — authed.
router.post("/add", isAuth, addOrder);

// Get all orders for logged-in user — authed.
router.get("/", isAuth, getOrderCustomer);

// Send invoice email — rate-limited, authed-ish (was public previously).
router.post(
  "/customer/invoice",
  emailVerificationLimit,
  optionalAuth,
  sendEmailInvoiceToCustomer
);

// Get single order — authed.
router.get("/:id", isAuth, getOrderById);

module.exports = router;
