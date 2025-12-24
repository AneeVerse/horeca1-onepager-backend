const mongoose = require("mongoose");
require("dotenv").config();

const RAZORPAY_KEY_ID = "rzp_test_Rv3s5MushHY7Ac";
const RAZORPAY_KEY_SECRET = "43LzqMl4iSAGrkCnOJ0YuitS";

async function updateRazorpayKeys() {
  try {
    // Ensure we connect to horeca1 database
    let mongoUri = process.env.MONGO_URI;
    // Force horeca1 database
    if (mongoUri.includes(".mongodb.net/")) {
      mongoUri = mongoUri.replace(/\.mongodb\.net\/[^?]*/, ".mongodb.net/horeca1");
    }
    await mongoose.connect(mongoUri, { dbName: "horeca1" });
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    
    // Update storeSetting document in settings collection
    const result = await db.collection("settings").updateOne(
      { name: "storeSetting" },
      {
        $set: {
          "setting.razorpay_id": RAZORPAY_KEY_ID,
          "setting.razorpay_secret": RAZORPAY_KEY_SECRET,
          "setting.razorpay_status": true,
        },
      }
    );

    if (result.matchedCount === 0) {
      // If no document exists, create one
      await db.collection("settings").insertOne({
        name: "storeSetting",
        setting: {
          razorpay_id: RAZORPAY_KEY_ID,
          razorpay_secret: RAZORPAY_KEY_SECRET,
          razorpay_status: true,
        },
      });
      console.log("Created new storeSetting with Razorpay keys");
    } else {
      console.log("Updated Razorpay keys in storeSetting");
    }

    // Verify
    const setting = await db.collection("settings").findOne({ name: "storeSetting" });
    console.log("Razorpay settings:", {
      razorpay_id: setting?.setting?.razorpay_id,
      razorpay_status: setting?.setting?.razorpay_status,
      razorpay_secret: setting?.setting?.razorpay_secret ? "***" : "NOT SET",
    });

    await mongoose.disconnect();
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

updateRazorpayKeys();

