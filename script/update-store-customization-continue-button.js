const mongoose = require("mongoose");
require("dotenv").config();
const Setting = require("../models/Setting");
const { connectDB } = require("../config/db");

const updateStoreCustomizationContinueButton = async () => {
  await connectDB();

  try {
    // Find the storeCustomizationSetting document
    const storeCustomizationSetting = await Setting.findOne({ name: "storeCustomizationSetting" });

    if (!storeCustomizationSetting) {
      console.log("❌ storeCustomizationSetting not found in database");
      console.log("📋 Creating new storeCustomizationSetting with updated continue_button...");
      
      // Import the default settings
      const defaultSettings = require("../utils/settings");
      const newSetting = new Setting({
        name: "storeCustomizationSetting",
        setting: defaultSettings[0].setting,
      });
      await newSetting.save();
      console.log("✅ Created new storeCustomizationSetting");
      await mongoose.disconnect();
      return;
    }

    console.log("📋 Current storeCustomizationSetting structure:", JSON.stringify(storeCustomizationSetting.setting?.checkout?.continue_button || "NOT FOUND", null, 2));

    // Update continue_button text - check setting property
    const settings = storeCustomizationSetting.setting || {};
    
    if (settings.checkout?.continue_button) {
      settings.checkout.continue_button.en = "Continue Shopping";
      
      storeCustomizationSetting.setting = settings;
      
      await storeCustomizationSetting.save();
      console.log("✅ Successfully updated continue_button text to 'Continue Shopping'");
    } else {
      // Initialize checkout if it doesn't exist
      if (!settings.checkout) {
        settings.checkout = {};
      }
      settings.checkout.continue_button = {
        en: "Continue Shopping",
        de: "Weiterversand"
      };
      
      storeCustomizationSetting.setting = settings;
      
      await storeCustomizationSetting.save();
      console.log("✅ Successfully created continue_button with text 'Continue Shopping'");
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error updating continue button text:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

updateStoreCustomizationContinueButton();

