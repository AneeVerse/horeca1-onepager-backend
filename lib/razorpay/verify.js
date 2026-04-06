const crypto = require("crypto");

// Verifies the Razorpay checkout handler signature.
// Formula: HMAC_SHA256(razorpayOrderId + "|" + razorpayPaymentId, keySecret)
// https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#15-verify-payment-signature
const verifyRazorpayPaymentSignature = (razorpayOrderId, razorpayPaymentId, razorpaySignature, keySecret) => {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !keySecret) {
        return false;
    }
    try {
        const body = `${razorpayOrderId}|${razorpayPaymentId}`;
        const expectedSignature = crypto
            .createHmac("sha256", keySecret)
            .update(body)
            .digest("hex");
        // Timing-safe comparison
        const sigBuf = Buffer.from(razorpaySignature, "utf8");
        const expBuf = Buffer.from(expectedSignature, "utf8");
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (err) {
        console.error("[RazorpayVerify] Payment signature verification error:", err.message);
        return false;
    }
};

// Verifies a Razorpay webhook signature from the X-Razorpay-Signature header.
// Requires the RAW request body (not parsed JSON).
// https://razorpay.com/docs/webhooks/validate-test/
const verifyRazorpayWebhookSignature = (rawBody, signature, webhookSecret) => {
    if (!rawBody || !signature || !webhookSecret) return false;
    try {
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");
        const sigBuf = Buffer.from(signature, "utf8");
        const expBuf = Buffer.from(expectedSignature, "utf8");
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (err) {
        console.error("[RazorpayVerify] Webhook signature verification error:", err.message);
        return false;
    }
};

module.exports = {
    verifyRazorpayPaymentSignature,
    verifyRazorpayWebhookSignature,
};
