const mongoose = require("mongoose");
require("dotenv").config();

async function checkOrders() {
  try {
    let mongoUri = process.env.MONGO_URI;
    if (mongoUri.includes(".mongodb.net/")) {
      mongoUri = mongoUri.replace(/\.mongodb\.net\/[^?]*/, ".mongodb.net/horeca1");
    }
    await mongoose.connect(mongoUri, { dbName: "horeca1" });
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    
    // Check orders collection
    const orders = await db.collection("orders").find({}).toArray();
    console.log("\n=== Orders in Database ===");
    console.log("Total orders:", orders.length);
    
    if (orders.length > 0) {
      console.log("\n--- Order Details ---");
      orders.forEach((order, index) => {
        console.log(`\nOrder ${index + 1}:`);
        console.log("  _id:", order._id);
        console.log("  invoice:", order.invoice);
        console.log("  status:", order.status);
        console.log("  total:", order.total);
        console.log("  paymentMethod:", order.paymentMethod);
        console.log("  user_info:", order.user_info ? {
          name: order.user_info.name,
          email: order.user_info.email,
          contact: order.user_info.contact
        } : "N/A");
        console.log("  createdAt:", order.createdAt);
        console.log("  updatedAt:", order.updatedAt);
        console.log("  cart items:", order.cart?.length || 0);
      });
    } else {
      console.log("No orders found in database!");
    }

    // Check order schema/structure
    const sampleOrder = orders[0];
    if (sampleOrder) {
      console.log("\n=== Sample Order Structure ===");
      console.log("Keys:", Object.keys(sampleOrder));
      console.log("Full structure:", JSON.stringify(sampleOrder, null, 2));
    }

    await mongoose.disconnect();
    console.log("\nDone!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkOrders();




