/**
 * One-time recovery script for captured Razorpay payments that never became orders.
 *
 * What it does:
 *   1. Connects to MongoDB (same URI as the backend)
 *   2. Connects to Razorpay API (same keys as the backend)
 *   3. Fetches all captured payments from Razorpay for the last N days
 *   4. For each payment, checks if an Order exists in our DB with that razorpayPaymentId
 *   5. If missing, tries to recover:
 *        a) First from PendingPayment.orderInfo (if the safety net record exists)
 *        b) Otherwise from Razorpay order notes (contain userId, phone, etc.)
 *        c) Otherwise logs the payment for manual investigation
 *
 * Usage:
 *   # Dry run (just print what would happen — no DB writes):
 *   node scripts/recover-lost-razorpay-orders.js --days 30 --dry-run
 *
 *   # Actual recovery:
 *   node scripts/recover-lost-razorpay-orders.js --days 30
 *
 * Safety:
 *   - Idempotent: safe to run multiple times. Existing orders are never touched.
 *   - Dry-run by default when --dry-run flag is passed.
 *   - Logs every action. Writes a report to `recovery-report-<timestamp>.json`.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");

// ---- CLI args ----
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? parseInt(args[daysArg + 1], 10) : 30;

console.log("========== Razorpay Lost Order Recovery ==========");
console.log("Days to scan:", days);
console.log("Dry run:", dryRun);
console.log("===================================================");

const main = async () => {
    // Connect DB
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
        throw new Error("MONGO_URI not set in env");
    }
    await mongoose.connect(MONGO_URI, { dbName: "horeca1", family: 4 });
    console.log("[DB] Connected");

    // Load models AFTER mongoose is connected
    const Order = require(path.join(__dirname, "..", "models", "Order"));
    const PendingPayment = require(path.join(__dirname, "..", "models", "PendingPayment"));
    const Setting = require(path.join(__dirname, "..", "models", "Setting"));
    const Customer = require(path.join(__dirname, "..", "models", "Customer"));

    // Load Razorpay credentials (DB first, env fallback)
    const storeSetting = await Setting.findOne({ name: "storeSetting" });
    const key_id =
        storeSetting?.setting?.razorpay_id || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_ID;
    const key_secret =
        storeSetting?.setting?.razorpay_secret || process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
    if (!key_id || !key_secret) {
        throw new Error("Razorpay credentials not found in DB or env");
    }
    const razorpay = new Razorpay({ key_id, key_secret });
    console.log("[Razorpay] Client initialized");

    // Fetch all captured payments for the last N days
    const fromEpoch = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const toEpoch = Math.floor(Date.now() / 1000);
    console.log(`[Razorpay] Fetching payments from ${new Date(fromEpoch * 1000).toISOString()}`);

    let allPayments = [];
    let skip = 0;
    const pageSize = 100;
    while (true) {
        const page = await razorpay.payments.all({ from: fromEpoch, to: toEpoch, count: pageSize, skip });
        if (!page.items || page.items.length === 0) break;
        allPayments = allPayments.concat(page.items);
        console.log(`[Razorpay] Fetched ${allPayments.length} payments so far...`);
        if (page.items.length < pageSize) break;
        skip += pageSize;
    }
    console.log(`[Razorpay] Total payments fetched: ${allPayments.length}`);

    const captured = allPayments.filter((p) => p.status === "captured");
    console.log(`[Razorpay] Captured payments: ${captured.length}`);

    const report = {
        generatedAt: new Date().toISOString(),
        dryRun,
        daysScanned: days,
        totalPaymentsFetched: allPayments.length,
        capturedCount: captured.length,
        alreadyHasOrder: [],
        recoveredFromPending: [],
        recoveredFromNotes: [],
        cannotRecover: [],
        errors: [],
    };

    for (const payment of captured) {
        try {
            // Check if order already exists
            const existingOrder = await Order.findOne({
                "razorpay.razorpayPaymentId": payment.id,
            });
            if (existingOrder) {
                report.alreadyHasOrder.push({
                    paymentId: payment.id,
                    orderId: existingOrder._id.toString(),
                    invoice: existingOrder.invoice,
                });
                continue;
            }

            // Try recovery from PendingPayment
            const pending = await PendingPayment.findOne({
                $or: [{ razorpayPaymentId: payment.id }, { razorpayOrderId: payment.order_id }],
            });

            if (pending && pending.orderInfo && pending.userId) {
                console.log(`[RECOVER] Recovering ${payment.id} from PendingPayment`);
                if (!dryRun) {
                    const { order } = await createOrderFromPayload({
                        Order,
                        userId: pending.userId,
                        orderInfo: pending.orderInfo,
                        razorpay: {
                            razorpayPaymentId: payment.id,
                            razorpayOrderId: payment.order_id,
                            razorpaySignature: pending.razorpaySignature || "",
                            amount: payment.amount / 100,
                        },
                    });
                    pending.status = "recovered";
                    pending.razorpayPaymentId = payment.id;
                    pending.recoveredOrderId = order._id;
                    pending.notes = `Recovered via recovery script at ${new Date().toISOString()}`;
                    await pending.save();
                    report.recoveredFromPending.push({
                        paymentId: payment.id,
                        orderId: order._id.toString(),
                        invoice: order.invoice,
                        amount: payment.amount / 100,
                    });
                } else {
                    report.recoveredFromPending.push({
                        paymentId: payment.id,
                        amount: payment.amount / 100,
                        note: "DRY RUN — would recover",
                    });
                }
                continue;
            }

            // Try recovery from Razorpay order notes
            let orderEntity = null;
            try {
                orderEntity = await razorpay.orders.fetch(payment.order_id);
            } catch (e) {
                // order not found in Razorpay — skip
            }
            const notes = orderEntity?.notes || payment.notes || {};
            if (notes.userId) {
                // Try to find customer by ID or phone
                let customer = null;
                try {
                    if (mongoose.Types.ObjectId.isValid(notes.userId)) {
                        customer = await Customer.findById(notes.userId);
                    }
                } catch {}
                if (!customer && notes.phone) {
                    customer = await Customer.findOne({ phone: notes.phone });
                }

                if (customer) {
                    console.log(`[RECOVER] Partial recovery from notes for ${payment.id} (cart data missing)`);
                    report.recoveredFromNotes.push({
                        paymentId: payment.id,
                        customerId: customer._id.toString(),
                        customerPhone: customer.phone,
                        customerName: notes.name,
                        amount: payment.amount / 100,
                        note: "Cart data unavailable — manual intervention required. Customer identified from notes.",
                    });
                    continue;
                }
            }

            // Cannot recover — log for manual investigation
            report.cannotRecover.push({
                paymentId: payment.id,
                razorpayOrderId: payment.order_id,
                amount: payment.amount / 100,
                contact: payment.contact,
                email: payment.email,
                capturedAt: new Date(payment.created_at * 1000).toISOString(),
                notes: orderEntity?.notes || payment.notes || {},
            });
        } catch (err) {
            console.error(`[ERROR] Processing ${payment.id}:`, err.message);
            report.errors.push({
                paymentId: payment.id,
                error: err.message,
            });
        }
    }

    // Save report
    const reportFile = path.join(__dirname, `..`, `recovery-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    console.log("\n========== RECOVERY REPORT ==========");
    console.log("Already had order:    ", report.alreadyHasOrder.length);
    console.log("Recovered from pending:", report.recoveredFromPending.length);
    console.log("Recovered from notes: ", report.recoveredFromNotes.length);
    console.log("Cannot recover:       ", report.cannotRecover.length);
    console.log("Errors:               ", report.errors.length);
    console.log("Report saved to:      ", reportFile);
    if (dryRun) {
        console.log("\n⚠  DRY RUN — no changes were made. Re-run without --dry-run to apply.");
    }

    await mongoose.disconnect();
    process.exit(0);
};

// Helper replicated from customerOrderController.createOrderFromPayload for standalone use.
// Kept minimal to avoid pulling in request/response dependencies.
async function createOrderFromPayload({ Order, userId, orderInfo, razorpay }) {
    // Idempotency re-check
    if (razorpay?.razorpayPaymentId) {
        const existing = await Order.findOne({ "razorpay.razorpayPaymentId": razorpay.razorpayPaymentId });
        if (existing) return { order: existing, created: false };
    }
    const lastOrder = await Order.findOne({}).sort({ invoice: -1 }).select("invoice").lean();
    const nextInvoice = lastOrder ? lastOrder.invoice + 1 : 10000;
    const newOrder = new Order({
        ...orderInfo,
        user: userId,
        invoice: nextInvoice,
        razorpay: razorpay,
    });
    const order = await newOrder.save();
    return { order, created: true };
}

main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
});
