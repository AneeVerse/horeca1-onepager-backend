const mongoose = require("mongoose");
const Order = require("../models/Order");
require("dotenv").config();

async function testOrdersQuery() {
  try {
    let mongoUri = process.env.MONGO_URI;
    if (mongoUri.includes(".mongodb.net/")) {
      mongoUri = mongoUri.replace(/\.mongodb\.net\/[^?]*/, ".mongodb.net/horeca1");
    }
    await mongoose.connect(mongoUri, { dbName: "horeca1" });
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    // Simulate the getAllOrders query logic
    const page = 1;
    const limit = 10;
    const status = ""; // Empty status filter
    
    const queryObject = {};
    
    // This is the logic from getAllOrders
    if (!status) {
      queryObject.$or = [
        { status: { $regex: `pending`, $options: "i" } },
        { status: { $regex: `processing`, $options: "i" } },
        { status: { $regex: `delivered`, $options: "i" } },
        { status: { $regex: `cancel`, $options: "i" } },
      ];
    }
    
    const pages = Number(page) || 1;
    const limits = Number(limit);
    const skip = (pages - 1) * limits;
    
    console.log("\n=== Query Test ===");
    console.log("Query Object:", JSON.stringify(queryObject, null, 2));
    console.log("Page:", pages);
    console.log("Limit:", limits);
    console.log("Skip:", skip);
    
    const totalDoc = await Order.countDocuments(queryObject);
    console.log("\nTotal documents matching query:", totalDoc);
    
    const orders = await Order.find(queryObject)
      .select("_id invoice paymentMethod subTotal total user_info discount shippingCost status createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limits);
    
    console.log("\nOrders found:", orders.length);
    orders.forEach((order, idx) => {
      console.log(`\nOrder ${idx + 1}:`);
      console.log("  _id:", order._id);
      console.log("  invoice:", order.invoice);
      console.log("  status:", order.status);
      console.log("  total:", order.total);
      console.log("  paymentMethod:", order.paymentMethod);
    });
    
    await mongoose.disconnect();
    console.log("\nDone!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

testOrdersQuery();




