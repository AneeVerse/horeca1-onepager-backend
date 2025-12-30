require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Models
const Product = require("../models/Product");
const Category = require("../models/Category");

// Database connection
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error("MONGO_URI is not defined in environment variables");
        }
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB connected successfully");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err.message);
        process.exit(1);
    }
};

// Parse CSV manually (simple parser for this format)
const parseCSV = (content) => {
    const lines = content.split(/\r?\n/);
    const products = [];

    let headerLine = "";
    let headerLineNumber = 0;

    // Find header line (may span multiple lines due to multiline column names)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("SKU") && lines[i].includes("Product Name")) {
            headerLine = lines[i];
            headerLineNumber = i;
            // Check if header continues on next lines (due to multiline column names)
            while (i + 1 < lines.length && !lines[i + 1].startsWith("Z") && !lines[i + 1].match(/^\d{3,4},/)) {
                i++;
                headerLineNumber = i;
            }
            break;
        }
    }

    // Process data lines
    for (let i = headerLineNumber + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith(",,,")) continue; // Skip empty lines

        const cols = line.split(",");
        if (!cols[0] || !cols[1]) continue; // Skip if no SKU or product name

        const sku = cols[0].trim();
        const productName = cols[1].trim();
        const hsn = cols[2]?.trim() || "";
        const unit = cols[3]?.trim() || "Pc";
        const brand = cols[4]?.trim() || "";
        const category = cols[5]?.trim() || "";
        const taxableRate = parseFloat(cols[6]?.replace(/[^\d.]/g, "") || "0");
        const taxPercent = parseFloat(cols[7]?.replace(/[%]/g, "") || "0");
        const grossRate = parseFloat(cols[8]?.replace(/[^\d.]/g, "") || "0");
        const imageName = cols[cols.length - 1]?.trim() || "";

        if (!productName || grossRate === 0) continue;

        products.push({
            sku,
            productName,
            hsn,
            unit,
            brand,
            category,
            taxableRate,
            taxPercent,
            grossRate,
            imageName
        });
    }

    return products;
};

// Generate slug from product name
const generateSlug = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
};

// Calculate bulk pricing based on gross rate
const calculateBulkPricing = (grossRate) => {
    // Bulk Rate 1: 5% discount for 5+ units
    // Bulk Rate 2: 10% discount for 10+ units
    const bulkRate1Price = Math.round(grossRate * 0.95 * 100) / 100;
    const bulkRate2Price = Math.round(grossRate * 0.90 * 100) / 100;

    return {
        bulkPricing: {
            bulkRate1: {
                quantity: 5,
                pricePerUnit: bulkRate1Price
            },
            bulkRate2: {
                quantity: 10,
                pricePerUnit: bulkRate2Price
            }
        },
        promoPricing: {
            singleUnit: Math.round(grossRate * 0.97 * 100) / 100, // 3% off for promo hours
            bulkRate1: {
                quantity: 5,
                pricePerUnit: Math.round(grossRate * 0.93 * 100) / 100 // 7% off
            },
            bulkRate2: {
                quantity: 10,
                pricePerUnit: Math.round(grossRate * 0.88 * 100) / 100 // 12% off
            }
        }
    };
};

// Placeholder image URL (food/grocery related)
const getPlaceholderImage = (category) => {
    // Using a consistent placeholder based on category
    const placeholders = {
        "Dairy": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
        "Sachet": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
        "Mayo & Sauces": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
        "Chinese": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
        "Beverages": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
        "DaVinci": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
    };
    return placeholders[category] || "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg";
};

const importProducts = async () => {
    try {
        await connectDB();

        // Read CSV file
        const csvPath = path.join(__dirname, "..", "..", "Copy of 6to9 Items & Categories - Products (1).csv");
        const csvContent = fs.readFileSync(csvPath, "utf-8");

        console.log("📖 Reading CSV file...");
        const csvProducts = parseCSV(csvContent);
        console.log(`📊 Found ${csvProducts.length} products in CSV`);

        // Get unique categories from CSV
        const uniqueCategories = [...new Set(csvProducts.map(p => p.category).filter(c => c))];
        console.log(`📂 Categories found: ${uniqueCategories.join(", ")}`);

        // Create or get categories
        const categoryMap = {};
        for (const categoryName of uniqueCategories) {
            let category = await Category.findOne({ "name.en": categoryName });

            if (!category) {
                // Create new category
                const lastCategory = await Category.findOne({}).sort({ order: -1 });
                const newOrder = lastCategory?.order !== undefined ? lastCategory.order + 1 : 0;

                category = new Category({
                    name: { en: categoryName },
                    description: { en: `${categoryName} products` },
                    status: "show",
                    order: newOrder,
                    parentId: null
                });
                await category.save();
                console.log(`✅ Created new category: ${categoryName}`);
            } else {
                console.log(`📁 Using existing category: ${categoryName}`);
            }

            categoryMap[categoryName] = category._id;
        }

        // Get existing product SKUs and names to avoid duplicates
        const existingProducts = await Product.find({}, { sku: 1, title: 1 });
        const existingSKUs = new Set(existingProducts.map(p => p.sku).filter(s => s));
        const existingNames = new Set(existingProducts.map(p => {
            const name = p.title?.en || "";
            return name.toLowerCase().replace(/[^a-z0-9]/g, "");
        }));
        console.log(`📦 Existing products in DB: ${existingProducts.length}`);

        // Import products
        let addedCount = 0;
        let skippedCount = 0;

        for (const csvProduct of csvProducts) {
            // Normalize product name for comparison
            const normalizedName = csvProduct.productName.toLowerCase().replace(/[^a-z0-9]/g, "");

            // Skip if SKU already exists
            if (existingSKUs.has(csvProduct.sku)) {
                console.log(`⏭️ Skipping duplicate SKU: ${csvProduct.productName} (SKU: ${csvProduct.sku})`);
                skippedCount++;
                continue;
            }

            // Skip if similar product name already exists
            if (existingNames.has(normalizedName)) {
                console.log(`⏭️ Skipping duplicate name: ${csvProduct.productName}`);
                skippedCount++;
                continue;
            }

            // Skip if no category
            if (!csvProduct.category || !categoryMap[csvProduct.category]) {
                console.log(`⚠️ Skipping (no category): ${csvProduct.productName}`);
                skippedCount++;
                continue;
            }

            const categoryId = categoryMap[csvProduct.category];
            const { bulkPricing, promoPricing } = calculateBulkPricing(csvProduct.grossRate);

            const product = new Product({
                productId: csvProduct.sku,
                sku: csvProduct.sku,
                hsn: csvProduct.hsn,
                unit: csvProduct.unit,
                brand: csvProduct.brand,
                taxableRate: csvProduct.taxableRate,
                taxPercent: csvProduct.taxPercent,
                title: { en: csvProduct.productName },
                description: { en: `${csvProduct.brand} - ${csvProduct.productName}` },
                slug: generateSlug(csvProduct.productName),
                categories: [categoryId],
                category: categoryId,
                image: [getPlaceholderImage(csvProduct.category)],
                stock: 100, // Default stock
                prices: {
                    originalPrice: csvProduct.grossRate,
                    price: csvProduct.grossRate,
                    discount: 0
                },
                bulkPricing,
                promoPricing,
                isCombination: false,
                status: "show",
                order: addedCount
            });

            await product.save();
            existingSKUs.add(csvProduct.sku); // Mark as added
            console.log(`✅ Added: ${csvProduct.productName} (₹${csvProduct.grossRate})`);
            addedCount++;
        }

        console.log("\n========================================");
        console.log(`🎉 Import Complete!`);
        console.log(`   ✅ Added: ${addedCount} products`);
        console.log(`   ⏭️ Skipped: ${skippedCount} products`);
        console.log(`   📂 Categories: ${Object.keys(categoryMap).length}`);
        console.log("========================================\n");

        process.exit(0);
    } catch (err) {
        console.error("❌ Error importing products:", err);
        process.exit(1);
    }
};

importProducts();
