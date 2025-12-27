require("dotenv").config();
const { connectDB } = require("../config/db");
const Category = require("../models/Category");

const fixCategories = async () => {
  try {
    await connectDB();
    
    console.log("Fixing categories to make them all parent categories...");
    
    // Update all categories to remove parentId (make them all parent categories)
    const result = await Category.updateMany(
      {},
      { $set: { parentId: null } }
    );
    
    console.log(`Updated ${result.modifiedCount} categories`);
    
    // Verify
    const totalCategories = await Category.countDocuments();
    const parentCategories = await Category.countDocuments({ parentId: null });
    
    console.log(`\nTotal categories: ${totalCategories}`);
    console.log(`Parent categories: ${parentCategories}`);
    
    // Show sample categories
    const sampleCategories = await Category.find({}).limit(10).select('name parentId');
    console.log("\nSample categories:");
    sampleCategories.forEach(cat => {
      console.log(`- ${cat.name?.en || cat.name}: parentId = ${cat.parentId}`);
    });
    
    console.log("\n✅ All categories are now parent categories!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

fixCategories();











