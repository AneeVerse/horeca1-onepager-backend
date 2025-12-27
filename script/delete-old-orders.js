require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/Order");

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error("❌ MONGO_URI is not defined in .env file");
  process.exit(1);
}

const deleteOldOrders = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Invoice numbers to delete
    const invoiceNumbers = [10001, 10002, 10003];

    // Find orders with these invoice numbers
    const ordersToDelete = await Order.find({ invoice: { $in: invoiceNumbers } });
    
    if (ordersToDelete.length === 0) {
      console.log("ℹ️  No orders found with invoice numbers:", invoiceNumbers.join(", "));
      await mongoose.disconnect();
      return;
    }

    console.log(`\n📋 Found ${ordersToDelete.length} order(s) to delete:`);
    ordersToDelete.forEach((order) => {
      console.log(`   - Invoice #${order.invoice} | Customer: ${order.user_info?.name || "N/A"} | Total: ₹${order.total} | Date: ${order.createdAt}`);
    });

    // Delete orders
    const result = await Order.deleteMany({ invoice: { $in: invoiceNumbers } });
    
    console.log(`\n✅ Successfully deleted ${result.deletedCount} order(s)`);
    console.log(`   Invoice numbers deleted: ${invoiceNumbers.join(", ")}`);

    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error deleting orders:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the script
deleteOldOrders();








