const mongoose = require("mongoose");

// This model stores Razorpay payments/orders as a safety net for order recovery.
//
// Lifecycle:
//   "created"   -> Razorpay order created, user redirected to checkout modal. No payment yet.
//   "captured"  -> Webhook / handler received successful payment, order creation pending.
//   "recovered" -> Order created in our DB successfully. recoveredOrderId is set.
//   "failed"    -> Payment captured but order creation failed — needs manual recovery.
//   "manual"    -> Admin marked as handled manually.
//
// Note: razorpayPaymentId is optional because the record is created BEFORE payment capture.
// razorpayOrderId is the stable unique key (guaranteed present from moment of creation).
const pendingPaymentSchema = new mongoose.Schema(
    {
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true, // primary key — always present
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            index: true, // indexed for lookup, NOT unique (can be null before capture)
        },
        razorpaySignature: {
            type: String,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            index: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        orderInfo: {
            type: Object, // full order payload — used to recreate the order
            required: true,
        },
        error: {
            type: String, // error message if order creation failed
        },
        status: {
            type: String,
            enum: ["created", "captured", "pending", "recovered", "failed", "manual"],
            default: "created",
            index: true,
        },
        recoveredOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        notes: {
            type: String,
        },
        recoveryAttempts: {
            type: Number,
            default: 0,
        },
        lastRecoveryAttemptAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

const PendingPayment = mongoose.model("PendingPayment", pendingPaymentSchema);
module.exports = PendingPayment;
