const mongoose = require("mongoose");
require("dotenv").config();
const Setting = require("../models/Setting");
const { connectDB } = require("../config/db");

const updateStoreCustomizationRemoveOrganic = async () => {
  await connectDB();
  
  try {

    // Find the storeCustomizationSetting document
    const storeCustomizationSetting = await Setting.findOne({ name: "storeCustomizationSetting" });

    if (!storeCustomizationSetting) {
      console.log("❌ storeCustomizationSetting not found in database");
      return;
    }

    console.log("📋 Updating storeCustomizationSetting to remove 'organic' references...");

    const settings = storeCustomizationSetting.setting || {};

    // Update home.quick_delivery_subtitle
    if (settings.home) {
      if (!settings.home.quick_delivery_subtitle) {
        settings.home.quick_delivery_subtitle = {};
      }
      // Force update - directly set the value
      settings.home.quick_delivery_subtitle = {
        ...settings.home.quick_delivery_subtitle,
        en: "Products and Food"
      };
      console.log("✅ Updated home.quick_delivery_subtitle.en to:", settings.home.quick_delivery_subtitle.en);
      
      // Update quick_delivery_description to replace KachaBazar with horeca1
      if (settings.home.quick_delivery_description) {
        const currentDesc = settings.home.quick_delivery_description.en || "";
        settings.home.quick_delivery_description = {
          ...settings.home.quick_delivery_description,
          en: currentDesc.replace(/KachaBazar/gi, "horeca1").replace(/kachabazar/gi, "horeca1")
        };
        console.log("✅ Updated home.quick_delivery_description.en (replaced KachaBazar with horeca1):", settings.home.quick_delivery_description.en);
      } else {
        // Initialize if it doesn't exist
        settings.home.quick_delivery_description = {
          en: "There are many products you will find in our shop, Choose your daily necessary product from our horeca1 shop and get some special offers. See Our latest discounted products from here and get a special discount."
        };
        console.log("✅ Created home.quick_delivery_description.en");
      }
    }

    // Update home.promotion_title
    if (settings.home) {
      if (!settings.home.promotion_title) {
        settings.home.promotion_title = {};
      }
      if (settings.home.promotion_title.en) {
        settings.home.promotion_title.en = settings.home.promotion_title.en.replace(/Organic/gi, "").replace(/organic/gi, "").trim();
        if (settings.home.promotion_title.en.includes("100% Natural Quality Product")) {
          // Already updated
        } else if (settings.home.promotion_title.en.includes("100% Natural Quality")) {
          settings.home.promotion_title.en = "100% Natural Quality Product";
        }
      }
      console.log("✅ Updated home.promotion_title.en");
    }

    // Update about_us descriptions (remove organic from long texts)
    if (settings.about_us) {
      if (settings.about_us.top_description?.en) {
        settings.about_us.top_description.en = settings.about_us.top_description.en.replace(/or organic/gi, "").replace(/organic/gi, "").trim();
      }
      if (settings.about_us.middle_description_one?.en) {
        settings.about_us.middle_description_one.en = settings.about_us.middle_description_one.en.replace(/or organic/gi, "").replace(/organic/gi, "").trim();
      }
      console.log("✅ Updated about_us descriptions");
    }

    // Update slug.card_description_six
    if (settings.slug) {
      if (!settings.slug.card_description_six) {
        settings.slug.card_description_six = {};
      }
      settings.slug.card_description_six.en = "Guaranteed 100% quality from natural products.";
      console.log("✅ Updated slug.card_description_six.en");
    }

    // Update seo meta_description and meta_title
    if (settings.seo) {
      if (settings.seo.meta_description) {
        settings.seo.meta_description = settings.seo.meta_description.replace(/Organic/gi, "").replace(/organic/gi, "").trim();
      }
      if (settings.seo.meta_title) {
        settings.seo.meta_title = settings.seo.meta_title.replace(/Organic/gi, "").replace(/organic/gi, "").trim();
      }
      console.log("✅ Updated seo meta_description and meta_title");
    }

    // Save the updated settings - use markModified to ensure nested objects are saved
    storeCustomizationSetting.setting = settings;
    storeCustomizationSetting.markModified('setting');
    storeCustomizationSetting.markModified('setting.home');
    storeCustomizationSetting.markModified('setting.home.quick_delivery_subtitle');
    storeCustomizationSetting.markModified('setting.home.quick_delivery_description');
    
    const saved = await storeCustomizationSetting.save();
    
    // Verify the save worked
    const verify = await Setting.findOne({ name: "storeCustomizationSetting" });
    console.log("✅ Successfully updated storeCustomizationSetting in database");
    console.log("📋 Verified quick_delivery_subtitle:", verify?.setting?.home?.quick_delivery_subtitle?.en);
    console.log("📋 Verified quick_delivery_description:", verify?.setting?.home?.quick_delivery_description?.en?.substring(0, 50) + "...");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error updating storeCustomizationSetting:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

updateStoreCustomizationRemoveOrganic();

