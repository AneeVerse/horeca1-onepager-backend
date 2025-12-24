const mongoose = require("mongoose");
require("dotenv").config();

async function checkRazorpayKeys() {
  try {
    // Ensure we connect to horeca1 database
    let mongoUri = process.env.MONGO_URI;
    if (mongoUri.includes(".mongodb.net/")) {
      mongoUri = mongoUri.replace(/\.mongodb\.net\/[^?]*/, ".mongodb.net/horeca1");
    }
    await mongoose.connect(mongoUri, { dbName: "horeca1" });
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    
    // Check all settings documents
    const settings = await db.collection("settings").find({}).toArray();
    console.log("\n=== All Settings Documents ===");
    console.log("Total documents:", settings.length);
    
    settings.forEach((setting, index) => {
      console.log(`\n--- Document ${index + 1} ---`);
      console.log("Name:", setting.name);
      console.log("Has 'setting' field:", !!setting.setting);
      if (setting.setting) {
        console.log("Setting keys:", Object.keys(setting.setting));
        if (setting.setting.razorpay_id) {
          console.log("Razorpay ID:", setting.setting.razorpay_id);
        } else {
          console.log("Razorpay ID: MISSING");
        }
        if (setting.setting.razorpay_secret) {
          console.log("Razorpay Secret: Present (hidden)");
        } else {
          console.log("Razorpay Secret: MISSING");
        }
      }
    });
    
    // Specifically check storeSetting
    const storeSetting = await db.collection("settings").findOne({ name: "storeSetting" });
    console.log("\n=== StoreSetting Document ===");
    if (storeSetting) {
      console.log("Found storeSetting document");
      console.log("Has 'setting' field:", !!storeSetting.setting);
      if (storeSetting.setting) {
        console.log("Razorpay ID:", storeSetting.setting.razorpay_id || "MISSING");
        console.log("Razorpay Secret:", storeSetting.setting.razorpay_secret ? "Present" : "MISSING");
        console.log("Razorpay Status:", storeSetting.setting.razorpay_status);
      }
    } else {
      console.log("ERROR: storeSetting document NOT FOUND!");
    }

    await mongoose.disconnect();
    console.log("\nDone!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkRazorpayKeys();




