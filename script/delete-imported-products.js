require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("=== Deleting ALL imported products to re-import ===\n");

    // Find categories from CSV
    const importedCategoryNames = ["Dairy", "Sachet", "Mayo & Sauces", "Chinese", "Beverages", "DaVinci"];

    const importedCategories = await Category.find({
        "name.en": { $in: importedCategoryNames }
    });

    console.log(`Found ${importedCategories.length} imported categories`);

    // Delete products with SKU (these are from CSV)
    const result = await Product.deleteMany({
        sku: { $exists: true, $ne: "" }
    });

    console.log(`Deleted ${result.deletedCount} products with SKU`);

    // Verify
    const remaining = await Product.countDocuments({});
    console.log(`Remaining products: ${remaining}`);

    mongoose.disconnect();
}).catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
