require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("=== Product Count Summary ===\n");

    const total = await Product.countDocuments({});
    const withSku = await Product.countDocuments({ sku: { $exists: true, $ne: "" } });
    const withoutSku = await Product.countDocuments({ $or: [{ sku: "" }, { sku: { $exists: false } }] });
    const showStatus = await Product.countDocuments({ status: "show" });
    const hideStatus = await Product.countDocuments({ status: "hide" });

    console.log(`Total Products: ${total}`);
    console.log(`With SKU (from CSV import): ${withSku}`);
    console.log(`Without SKU (old/seeded): ${withoutSku}`);
    console.log(`Status = 'show': ${showStatus}`);
    console.log(`Status = 'hide': ${hideStatus}`);

    // List all products with SKU (from CSV)
    console.log("\n=== All Products with SKU (from CSV) ===\n");
    const csvProducts = await Product.find({
        sku: { $exists: true, $ne: "" }
    })
        .populate("category", "name")
        .select("sku title status createdAt category prices")
        .sort({ createdAt: -1 });

    csvProducts.forEach((p, i) => {
        const cat = p.category?.name?.en || "N/A";
        const price = p.prices?.price || 0;
        console.log(`${i + 1}. ${p.title?.en || "NO TITLE"}`);
        console.log(`   SKU: ${p.sku} | Category: ${cat} | Price: ₹${price} | Status: ${p.status}`);
    });

    mongoose.disconnect();
}).catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
