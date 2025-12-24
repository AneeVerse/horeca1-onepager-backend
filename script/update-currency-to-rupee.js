require("dotenv").config();
const { connectDB } = require("../config/db");
const Setting = require("../models/Setting");
const Currency = require("../models/Currency");

const updateCurrencyToRupee = async () => {
  try {
    await connectDB();
    
    console.log("Updating currency to Indian Rupees (₹)...");
    
    // Update global settings to use ₹ as default currency
    const globalSetting = await Setting.findOne({ name: "globalSetting" });
    if (globalSetting) {
      globalSetting.setting.default_currency = "₹";
      await globalSetting.save();
      console.log("✓ Updated globalSetting default_currency to ₹");
    } else {
      console.log("⚠ globalSetting not found");
    }
    
    // Update or create Indian Rupee currency
    let rupeeCurrency = await Currency.findOne({ name: "Indian Rupee" });
    if (!rupeeCurrency) {
      // Check if Euro exists and update it, or create new
      const euroCurrency = await Currency.findOne({ name: "Euro" });
      if (euroCurrency) {
        euroCurrency.name = "Indian Rupee";
        euroCurrency.symbol = "₹";
        await euroCurrency.save();
        console.log("✓ Updated Euro currency to Indian Rupee");
      } else {
        rupeeCurrency = new Currency({
          name: "Indian Rupee",
          symbol: "₹",
          status: "show",
        });
        await rupeeCurrency.save();
        console.log("✓ Created Indian Rupee currency");
      }
    } else {
      rupeeCurrency.symbol = "₹";
      rupeeCurrency.status = "show";
      await rupeeCurrency.save();
      console.log("✓ Updated existing Indian Rupee currency");
    }
    
    // Ensure Indian Rupee is the first/default currency
    const allCurrencies = await Currency.find({});
    console.log("\nCurrent currencies in database:");
    allCurrencies.forEach(curr => {
      console.log(`- ${curr.name}: ${curr.symbol} (status: ${curr.status})`);
    });
    
    console.log("\n✅ Currency updated to Indian Rupees (₹)!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

updateCurrencyToRupee();







