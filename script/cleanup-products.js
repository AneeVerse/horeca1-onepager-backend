require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");

// The 5 products to KEEP (from the user's screenshot)
const productsToKeep = [
    "Veeba Chilli Flakes Sachet (8g x 250 pcs)",
    "Veeba Tomato Ketchup Sachet (8g x 100 pcs)",
    "B-Bite Processed Cheese Analogue Spl 1Kg",
    "Qualita Processed Cheese Block Special Analogue 1KG",
    "Qualita Processed Cheese Block Regular Analogue 1KG"
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("=== Cleaning up products ===\n");

    // First, find the 5 products to keep
    const keepProducts = await Product.find({
        $or: productsToKeep.map(name => ({
            "title.en": { $regex: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        }))
    }).select("_id title.en");

    console.log(`Found ${keepProducts.length} products to KEEP:`);
    keepProducts.forEach((p, i) => console.log(`  ${i + 1}. ${p.title?.en}`));

    const keepIds = keepProducts.map(p => p._id);

    // Count products to delete
    const toDeleteCount = await Product.countDocuments({ _id: { $nin: keepIds } });
    console.log(`\nProducts to DELETE: ${toDeleteCount}`);

    // Delete all except the 5 to keep
    const result = await Product.deleteMany({ _id: { $nin: keepIds } });
    console.log(`\n✅ Deleted ${result.deletedCount} products`);

    // Verify remaining
    const remaining = await Product.countDocuments({});
    console.log(`📦 Remaining products: ${remaining}`);

    mongoose.disconnect();
}).catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
