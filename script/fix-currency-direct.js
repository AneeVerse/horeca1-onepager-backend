require("dotenv").config();
const { connectDB } = require("../config/db");
const Setting = require("../models/Setting");

const fixCurrencyDirect = async () => {
  try {
    await connectDB();
    
    console.log("Directly updating currency in database...");
    
    // Find and update the globalSetting
    const globalSetting = await Setting.findOne({ name: "globalSetting" });
    
    if (!globalSetting) {
      console.log("❌ globalSetting not found!");
      process.exit(1);
    }
    
    console.log("Current currency:", globalSetting.setting.default_currency);
    
    // Update the currency directly
    globalSetting.setting.default_currency = "₹";
    await globalSetting.save();
    
    console.log("✅ Currency updated!");
    
    // Verify
    const updated = await Setting.findOne({ name: "globalSetting" });
    console.log("New currency:", updated.setting.default_currency);
    
    if (updated.setting.default_currency === "₹") {
      console.log("\n✅ SUCCESS! Currency is now ₹");
    } else {
      console.log("\n❌ FAILED! Currency is still", updated.setting.default_currency);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

fixCurrencyDirect();







