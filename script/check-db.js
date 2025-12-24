require("dotenv").config();
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const Category = require("../models/Category");

const checkDatabase = async () => {
  try {
    await connectDB();
    
    const dbName = mongoose.connection.db.databaseName;
    const dbHost = mongoose.connection.host;
    
    console.log("\n=== DATABASE CONNECTION INFO ===");
    console.log("Database Name:", dbName);
    console.log("Database Host:", dbHost);
    console.log("Connection String:", mongoose.connection.client.s.url.replace(/\/\/.*@/, '//***:***@'));
    
    const productCount = await Product.countDocuments();
    const categoryCount = await Category.countDocuments();
    
    console.log("\n=== COLLECTION COUNTS ===");
    console.log("Products:", productCount);
    console.log("Categories:", categoryCount);
    
    if (productCount > 0) {
      const sampleProduct = await Product.findOne();
      console.log("\n=== SAMPLE PRODUCT ===");
      console.log("ID:", sampleProduct._id);
      console.log("Title:", sampleProduct.title);
    }
    
    if (categoryCount > 0) {
      const sampleCategory = await Category.findOne();
      console.log("\n=== SAMPLE CATEGORY ===");
      console.log("ID:", sampleCategory._id);
      console.log("Name:", sampleCategory.name);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

const mongoose = require("mongoose");
checkDatabase();







