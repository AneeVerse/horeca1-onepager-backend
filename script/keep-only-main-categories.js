require("dotenv").config();
const { connectDB } = require("../config/db");
const Category = require("../models/Category");

// List of category names to keep (from the admin panel)
const categoriesToKeep = [
  "Fish & Meat",
  "Fruits & Vegetable",
  "Cooking Essentials",
  "Biscuits & Cakes",
  "Household Tools",
  "Pet Care",
  "Beauty & Healths",
  "Jam & Jelly",
  "Milk & Dairy",
  "Drinks",
  "Breakfast"
];

const keepOnlyMainCategories = async () => {
  try {
    await connectDB();
    
    console.log("Finding categories to keep...");
    
    // Find all categories and match by name
    const allCategories = await Category.find({});
    const categoriesToKeepIds = [];
    
    for (const categoryName of categoriesToKeep) {
      // Try to find category by name (checking English name)
      const category = allCategories.find(cat => {
        const name = cat.name?.en || cat.name || "";
        return name === categoryName || name.includes(categoryName) || categoryName.includes(name);
      });
      
      if (category) {
        categoriesToKeepIds.push(category._id);
        console.log(`✓ Found: ${categoryName} (ID: ${category._id})`);
      } else {
        console.log(`✗ Not found: ${categoryName}`);
      }
    }
    
    console.log(`\nFound ${categoriesToKeepIds.length} categories to keep`);
    console.log(`Total categories in database: ${allCategories.length}`);
    
    if (categoriesToKeepIds.length === 0) {
      console.log("No categories found to keep. Aborting.");
      process.exit(1);
    }
    
    // Delete all categories except the ones to keep
    const deleteResult = await Category.deleteMany({
      _id: { $nin: categoriesToKeepIds }
    });
    
    console.log(`\n✅ Deleted ${deleteResult.deletedCount} categories`);
    
    // Verify remaining categories
    const remainingCategories = await Category.find({}).sort({ _id: -1 });
    console.log(`\nRemaining categories (${remainingCategories.length}):`);
    remainingCategories.forEach(cat => {
      const name = cat.name?.en || cat.name || "Unknown";
      console.log(`- ${name} (ID: ${cat._id})`);
    });
    
    console.log("\n✅ Database cleanup complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

keepOnlyMainCategories();







