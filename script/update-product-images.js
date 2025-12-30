require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");

// High-quality food product images from Unsplash (free to use)
const categoryImages = {
    // Dairy products
    "cheese": [
        "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&h=400&fit=crop",
        "https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=400&h=400&fit=crop",
        "https://images.unsplash.com/photo-1589881133825-bbb3b9471b1b?w=400&h=400&fit=crop"
    ],
    "butter": [
        "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&h=400&fit=crop"
    ],
    "ghee": [
        "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=400&fit=crop"
    ],
    // Sauces and condiments
    "ketchup": [
        "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&h=400&fit=crop"
    ],
    "sauce": [
        "https://images.unsplash.com/photo-1585325701165-351af916e581?w=400&h=400&fit=crop",
        "https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=400&h=400&fit=crop"
    ],
    "mayonnaise": [
        "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop"
    ],
    "chilli": [
        "https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400&h=400&fit=crop"
    ],
    "pickle": [
        "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=400&fit=crop"
    ],
    // Beverages
    "syrup": [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
        "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&h=400&fit=crop"
    ],
    "coffee": [
        "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400&h=400&fit=crop"
    ],
    "smoothie": [
        "https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=400&h=400&fit=crop"
    ],
    "chocolate": [
        "https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&h=400&fit=crop"
    ],
    "caramel": [
        "https://images.unsplash.com/photo-1582176604856-e824b4736522?w=400&h=400&fit=crop"
    ],
    "vanilla": [
        "https://images.unsplash.com/photo-1499638673689-79a0b5115d87?w=400&h=400&fit=crop"
    ],
    "strawberry": [
        "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop"
    ],
    "blueberry": [
        "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=400&h=400&fit=crop"
    ],
    "mango": [
        "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=400&fit=crop"
    ],
    "peach": [
        "https://images.unsplash.com/photo-1595124332757-90c8c98a3c04?w=400&h=400&fit=crop"
    ],
    "mint": [
        "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=400&h=400&fit=crop"
    ],
    "lemon": [
        "https://images.unsplash.com/photo-1582087370222-c5c9e4c1c6a3?w=400&h=400&fit=crop"
    ],
    "coconut": [
        "https://images.unsplash.com/photo-1550828520-4cb496926fc9?w=400&h=400&fit=crop"
    ],
    "hazelnut": [
        "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=400&h=400&fit=crop"
    ],
    // Sachets
    "sachet": [
        "https://images.unsplash.com/photo-1599599810694-dd7c8afc37fc?w=400&h=400&fit=crop"
    ],
    "oregano": [
        "https://images.unsplash.com/photo-1600411832853-2b12dd5efc72?w=400&h=400&fit=crop"
    ],
    // Chinese
    "soy": [
        "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=400&fit=crop"
    ],
    // Default
    "default": [
        "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=400&h=400&fit=crop",
        "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&h=400&fit=crop"
    ]
};

// Find best matching image for a product
const findImageForProduct = (productName) => {
    const nameLower = productName.toLowerCase();

    // Check for specific keywords in product name
    const keywords = Object.keys(categoryImages);
    for (const keyword of keywords) {
        if (keyword !== "default" && nameLower.includes(keyword)) {
            const images = categoryImages[keyword];
            return images[Math.floor(Math.random() * images.length)];
        }
    }

    // Default image
    const defaultImages = categoryImages["default"];
    return defaultImages[Math.floor(Math.random() * defaultImages.length)];
};

const updateProductImages = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB\n");

        // Get all products
        const products = await Product.find({});
        console.log(`📦 Found ${products.length} products\n`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const product of products) {
            const productName = product.title?.en || "";
            const currentImage = product.image?.[0] || "";

            // Skip if already has a good Cloudinary image (manually uploaded)
            if (currentImage.includes("cloudinary.com") && !currentImage.includes("/demo/")) {
                console.log(`⏭️ Skipping (has Cloudinary image): ${productName}`);
                skippedCount++;
                continue;
            }

            // Find appropriate image
            const newImage = findImageForProduct(productName);

            // Update product
            await Product.findByIdAndUpdate(product._id, {
                image: [newImage]
            });

            console.log(`✅ Updated: ${productName}`);
            updatedCount++;
        }

        console.log("\n========================================");
        console.log("🎉 Image Update Complete!");
        console.log(`   ✅ Updated: ${updatedCount} products`);
        console.log(`   ⏭️ Skipped: ${skippedCount} products`);
        console.log("========================================\n");

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
};

updateProductImages();
