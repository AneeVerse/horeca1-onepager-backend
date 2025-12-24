const mongoose = require("mongoose");
require("dotenv").config();
const Setting = require("../models/Setting");
const { connectDB } = require("../config/db");

const updateContinueButtonText = async () => {
  await connectDB();

  try {
    // Find the storeSetting document
    const storeSetting = await Setting.findOne({ name: "storeSetting" });

    if (!storeSetting) {
      console.log("❌ storeSetting not found in database");
      await mongoose.disconnect();
      return;
    }

    console.log("📋 Current storeSetting structure:", JSON.stringify(storeSetting.setting || storeSetting.value, null, 2));

    // Update continue_button text - check both setting and value properties
    const settings = storeSetting.setting || storeSetting.value || {};
    
    if (settings.checkout?.continue_button) {
      settings.checkout.continue_button.en = "Continue Shopping";
      
      if (storeSetting.setting) {
        storeSetting.setting = settings;
      } else {
        storeSetting.value = settings;
      }
      
      await storeSetting.save();
      console.log("✅ Successfully updated continue_button text to 'Continue Shopping'");
    } else {
      // Try to initialize checkout if it doesn't exist
      if (!settings.checkout) {
        settings.checkout = {};
      }
      settings.checkout.continue_button = {
        en: "Continue Shopping",
        de: "Weiterversand"
      };
      
      if (storeSetting.setting) {
        storeSetting.setting = settings;
      } else {
        storeSetting.value = settings;
      }
      
      await storeSetting.save();
      console.log("✅ Successfully created continue_button with text 'Continue Shopping'");
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error updating continue button text:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

updateContinueButtonText();

