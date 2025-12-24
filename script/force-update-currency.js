require("dotenv").config();
const { connectDB } = require("../config/db");
const Setting = require("../models/Setting");

const forceUpdateCurrency = async () => {
  try {
    await connectDB();
    
    console.log("Force updating currency to ₹...");
    
    // Update globalSetting directly
    const result = await Setting.updateOne(
      { name: "globalSetting" },
      { $set: { "setting.default_currency": "₹" } }
    );
    
    console.log(`Update result:`, result);
    
    // Verify
    const globalSetting = await Setting.findOne({ name: "globalSetting" });
    console.log("\n✅ Updated currency:", globalSetting?.setting?.default_currency);
    
    if (globalSetting?.setting?.default_currency === "₹") {
      console.log("✅ Currency successfully updated to ₹!");
    } else {
      console.log("❌ Currency update failed!");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

forceUpdateCurrency();







