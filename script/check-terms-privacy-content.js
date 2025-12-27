require("dotenv").config();
const { connectDB } = require("../config/db");
const Setting = require("../models/Setting");

const checkContent = async () => {
  try {
    await connectDB();
    
    const setting = await Setting.findOne({ name: "storeCustomizationSetting" });
    
    if (!setting) {
      console.log("❌ storeCustomizationSetting not found");
      process.exit(1);
    }

    console.log("\n=== TERMS AND CONDITIONS CONTENT ===");
    if (setting.setting?.term_and_condition?.description?.en) {
      const content = setting.setting.term_and_condition.description.en;
      // Check for variations
      const hasKachaBazar = /KachaBazar/i.test(content);
      const hasKachabazar = /kachabazar/i.test(content);
      
      console.log("Has KachaBazar (case insensitive):", hasKachaBazar || hasKachabazar);
      if (hasKachaBazar || hasKachabazar) {
        const matches = content.match(/Kacha[Bb]azar/gi);
        console.log("Matches found:", matches);
        // Show first 500 chars
        console.log("\nFirst 500 characters:");
        console.log(content.substring(0, 500));
      } else {
        console.log("✅ No KachaBazar found in terms");
        // Show first 200 chars to verify
        console.log("\nFirst 200 characters:");
        console.log(content.substring(0, 200));
      }
    }

    console.log("\n=== PRIVACY POLICY CONTENT ===");
    if (setting.setting?.privacy_policy?.description?.en) {
      const content = setting.setting.privacy_policy.description.en;
      const hasKachaBazar = /KachaBazar/i.test(content);
      const hasKachabazar = /kachabazar/i.test(content);
      
      console.log("Has KachaBazar (case insensitive):", hasKachaBazar || hasKachabazar);
      if (hasKachaBazar || hasKachabazar) {
        const matches = content.match(/Kacha[Bb]azar/gi);
        console.log("Matches found:", matches);
        // Show first 500 chars
        console.log("\nFirst 500 characters:");
        console.log(content.substring(0, 500));
      } else {
        console.log("✅ No KachaBazar found in privacy policy");
        // Show first 200 chars to verify
        console.log("\nFirst 200 characters:");
        console.log(content.substring(0, 200));
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
};

checkContent();

