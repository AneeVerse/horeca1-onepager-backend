require("dotenv").config();
const { connectDB } = require("../config/db");
const Setting = require("../models/Setting");

const updateTermsAndPrivacy = async () => {
  try {
    await connectDB();
    // Find the setting document
    const setting = await Setting.findOne({ name: "storeCustomizationSetting" });
    
    if (!setting) {
      console.log("❌ storeCustomizationSetting not found");
      process.exit(1);
    }

    let updated = false;

    // Helper function to replace all variations
    const replaceKachaBazar = (content) => {
      if (!content) return content;
      let newContent = content;
      // Replace all case variations of KachaBazar/kachabazar
      newContent = newContent.replace(/KachaBazar/gi, "horeca1");
      // Replace kachabazar.com (case insensitive)
      newContent = newContent.replace(/kachabazar\.com/gi, "horeca1.com");
      // Replace "kachabazar dot com" (case insensitive)
      newContent = newContent.replace(/kachabazar\s+dot\s+com/gi, "horeca1.com");
      // Replace "KachaBazar's" possessive form
      newContent = newContent.replace(/KachaBazar's/gi, "horeca1's");
      return newContent;
    };

    // Update term_and_condition description
    if (setting.setting?.term_and_condition?.description?.en) {
      const oldContent = setting.setting.term_and_condition.description.en;
      const newContent = replaceKachaBazar(oldContent);
      
      if (oldContent !== newContent) {
        setting.setting.term_and_condition.description.en = newContent;
        updated = true;
        console.log("✅ Updated term_and_condition.description.en (replaced KachaBazar with horeca1)");
        // Count how many replacements were made
        const oldMatches = (oldContent.match(/KachaBazar/gi) || []).length;
        const newMatches = (newContent.match(/KachaBazar/gi) || []).length;
        console.log(`   Replaced ${oldMatches - newMatches} occurrences`);
      } else {
        console.log("ℹ️  term_and_condition.description.en already uses horeca1");
      }
    }

    // Update privacy_policy description
    if (setting.setting?.privacy_policy?.description?.en) {
      const oldContent = setting.setting.privacy_policy.description.en;
      const newContent = replaceKachaBazar(oldContent);
      
      if (oldContent !== newContent) {
        setting.setting.privacy_policy.description.en = newContent;
        updated = true;
        console.log("✅ Updated privacy_policy.description.en (replaced KachaBazar with horeca1)");
        // Count how many replacements were made
        const oldMatches = (oldContent.match(/KachaBazar/gi) || []).length;
        const newMatches = (newContent.match(/KachaBazar/gi) || []).length;
        console.log(`   Replaced ${oldMatches - newMatches} occurrences`);
      } else {
        console.log("ℹ️  privacy_policy.description.en already uses horeca1");
      }
    }

    if (updated) {
      // Mark the nested paths as modified so Mongoose knows to save them
      if (setting.setting?.term_and_condition?.description?.en) {
        setting.markModified('setting.term_and_condition.description.en');
      }
      if (setting.setting?.privacy_policy?.description?.en) {
        setting.markModified('setting.privacy_policy.description.en');
      }
      setting.markModified('setting');
      await setting.save();
      console.log("✅ Successfully updated terms and privacy policy in database!");
      
      // Verify the save
      const verify = await Setting.findOne({ name: "storeCustomizationSetting" });
      const termsHasKachaBazar = /KachaBazar/i.test(verify?.setting?.term_and_condition?.description?.en || '');
      const privacyHasKachaBazar = /KachaBazar/i.test(verify?.setting?.privacy_policy?.description?.en || '');
      if (termsHasKachaBazar || privacyHasKachaBazar) {
        console.log("⚠️  Warning: Still found KachaBazar after save. Retrying with direct update...");
        // Try direct update using $set
        await Setting.updateOne(
          { name: "storeCustomizationSetting" },
          { $set: setting.setting }
        );
        console.log("✅ Retried with direct $set update");
      }
    } else {
      console.log("ℹ️  No changes needed - content already uses horeca1");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating terms and privacy:", error.message);
    process.exit(1);
  }
};

updateTermsAndPrivacy();

