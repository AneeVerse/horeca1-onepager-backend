require("dotenv").config();
const { connectDB } = require("../config/db");
const Product = require("../models/Product");

const keepOnlyQualitaProduct = async () => {
  try {
    await connectDB();
    
    console.log("Finding Qualita product to keep...");
    
    // Find the Qualita product by name (checking English title)
    const qualitaProduct = await Product.findOne({
      $or: [
        { "title.en": { $regex: /Qualita.*Cheese/i } },
        { "title.en": { $regex: /Qualita.*Processed/i } },
        { "title.en": "Qualita Processed Cheese Block Regular Analogue 1KG" }
      ]
    });
    
    if (!qualitaProduct) {
      console.log("❌ Qualita product not found!");
      console.log("Searching for products with 'Qualita' in name...");
      const productsWithQualita = await Product.find({
        $or: [
          { "title.en": { $regex: /Qualita/i } }
        ]
      }).limit(5);
      
      if (productsWithQualita.length > 0) {
        console.log("Found products with 'Qualita':");
        productsWithQualita.forEach(p => {
          console.log(`- ${p.title?.en || p.title} (ID: ${p._id})`);
        });
      } else {
        console.log("No products found with 'Qualita' in name.");
      }
      process.exit(1);
    }
    
    console.log(`✓ Found Qualita product:`);
    console.log(`  ID: ${qualitaProduct._id}`);
    console.log(`  Title: ${qualitaProduct.title?.en || qualitaProduct.title}`);
    console.log(`  Category: ${qualitaProduct.category}`);
    console.log(`  Price: $${qualitaProduct.prices?.price || qualitaProduct.price}`);
    
    // Get total count before deletion
    const totalProducts = await Product.countDocuments();
    console.log(`\nTotal products in database: ${totalProducts}`);
    
    // Delete all products except the Qualita product
    const deleteResult = await Product.deleteMany({
      _id: { $ne: qualitaProduct._id }
    });
    
    console.log(`\n✅ Deleted ${deleteResult.deletedCount} products`);
    
    // Verify remaining products
    const remainingProducts = await Product.find({});
    console.log(`\nRemaining products (${remainingProducts.length}):`);
    remainingProducts.forEach(product => {
      const title = product.title?.en || product.title || "Unknown";
      console.log(`- ${title} (ID: ${product._id})`);
    });
    
    console.log("\n✅ Database cleanup complete!");
    console.log("Only Qualita Processed Cheese Block Regular Analogue 1KG remains.");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

keepOnlyQualitaProduct();







