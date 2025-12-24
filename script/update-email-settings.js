const mongoose = require("mongoose");
require("dotenv").config();

async function updateEmailSettings() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "horeca1" });
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    
    // Update globalSetting to enable email_to_customer
    const result = await db.collection("settings").updateOne(
      { name: "globalSetting" },
      {
        $set: {
          "setting.email_to_customer": true,
          "setting.email_to_owner": "team.horeca1@gmail.com",
          "setting.from_email": "orders@horeca1.com",
          "setting.shop_name": "horeca1",
          "setting.company_name": "horeca1",
          "setting.email": "team.horeca1@gmail.com",
        },
      }
    );

    if (result.matchedCount === 0) {
      console.log("No globalSetting found, creating one...");
      await db.collection("settings").insertOne({
        name: "globalSetting",
        setting: {
          email_to_customer: true,
          email_to_owner: "team.horeca1@gmail.com",
          from_email: "orders@horeca1.com",
          shop_name: "horeca1",
          company_name: "horeca1",
          email: "team.horeca1@gmail.com",
          default_currency: "₹",
        },
      });
    } else {
      console.log("Updated email settings in globalSetting");
    }

    // Verify
    const setting = await db.collection("settings").findOne({ name: "globalSetting" });
    console.log("Email settings:", {
      email_to_customer: setting?.setting?.email_to_customer,
      email_to_owner: setting?.setting?.email_to_owner,
      from_email: setting?.setting?.from_email,
      shop_name: setting?.setting?.shop_name,
    });

    await mongoose.disconnect();
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

updateEmailSettings();

