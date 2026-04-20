/**
 * Set a product's stock to 1 for race-condition testing, then restore it.
 * Usage: node scripts/set-stock.js <productId> <stock>
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const productId = process.argv[2];
const newStock  = parseInt(process.argv[3] ?? "1", 10);

if (!productId) {
  console.error("Usage: node scripts/set-stock.js <productId> <stock>");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Product = require("../models/Product");
  const before  = await Product.findById(productId).lean();
  if (!before) { console.error("Product not found"); process.exit(1); }
  console.log(`Before: title="${JSON.stringify(before.title)}"  stock=${before.stock}`);

  await Product.updateOne({ _id: productId }, { $set: { stock: newStock } });
  const after = await Product.findById(productId).lean();
  console.log(`After:  stock=${after.stock}`);
  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
