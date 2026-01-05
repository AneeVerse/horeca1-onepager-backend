const Product = require("../models/Product");
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Review = require("../models/Review");
const { languageCodes } = require("../utils/data");

const addProduct = async (req, res) => {
  try {
    const newProduct = new Product({
      ...req.body,
      // productId: cname + (count + 1),
      productId: req.body.productId || new mongoose.Types.ObjectId().toString(),
    });

    await newProduct.save();
    res.send(newProduct);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const addAllProducts = async (req, res) => {
  try {
    // console.log('product data',req.body)
    await Product.deleteMany();
    await Product.insertMany(req.body);
    res.status(200).send({
      message: "Product Added successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getShowingProducts = async (req, res) => {
  try {
    const products = await Product.find({ status: "show" }).sort({ _id: -1 });
    res.send(products);
    // console.log("products", products);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getAllProducts = async (req, res) => {
  const { title, category, price, page, limit } = req.query;

  // console.log("getAllProducts");

  let queryObject = {};
  let sortObject = {};
  if (title) {
    // Decode URL-encoded title first
    let decodedTitle;
    try {
      decodedTitle = decodeURIComponent(title);
    } catch (e) {
      // If already decoded or invalid, use as is
      decodedTitle = title;
    }

    // Split into words and create flexible search
    const words = decodedTitle.trim().split(/\s+/).filter(word => word.length > 0);

    if (words.length > 0) {
      // Escape special regex characters for each word
      const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      // Create regex that matches all words (in any order)
      const regexPattern = escapedWords.join('.*');

      // Create regex queries for each language
      const titleQueries = languageCodes.map((lang) => ({
        [`title.${lang}`]: { $regex: regexPattern, $options: "i" },
      }));

      queryObject.$or = titleQueries;
    }
  }

  if (price === "low") {
    sortObject = {
      "prices.originalPrice": 1,
    };
  } else if (price === "high") {
    sortObject = {
      "prices.originalPrice": -1,
    };
  } else if (price === "published") {
    queryObject.status = "show";
  } else if (price === "unPublished") {
    queryObject.status = "hide";
  } else if (price === "status-selling") {
    queryObject.stock = { $gt: 0 };
  } else if (price === "status-out-of-stock") {
    queryObject.stock = { $lt: 1 };
  } else if (price === "date-added-asc") {
    sortObject.createdAt = 1;
  } else if (price === "date-added-desc") {
    sortObject.createdAt = -1;
  } else if (price === "date-updated-asc") {
    sortObject.updatedAt = 1;
  } else if (price === "date-updated-desc") {
    sortObject.updatedAt = -1;
  } else {
    sortObject = { _id: -1 };
  }

  // console.log('sortObject', sortObject);

  if (category) {
    queryObject.categories = category;
  }

  const pages = Number(page);
  const limits = Number(limit);
  const skip = (pages - 1) * limits;

  try {
    const totalDoc = await Product.countDocuments(queryObject);

    const products = await Product.find(queryObject)
      .populate({ path: "category", select: "_id name" })
      .populate({ path: "categories", select: "_id name" })
      .sort(sortObject)
      .skip(skip)
      .limit(limits);

    res.send({
      products,
      totalDoc,
      limits,
      pages,
    });
  } catch (err) {
    // console.log("error", err);
    res.status(500).send({
      message: err.message,
    });
  }
};

const getProductBySlug = async (req, res) => {
  // console.log("slug", req.params.slug);
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    res.send(product);
  } catch (err) {
    res.status(500).send({
      message: `Slug problem, ${err.message}`,
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate({ path: "category", select: "_id, name" })
      .populate({ path: "categories", select: "_id name" });

    res.send(product);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateProduct = async (req, res) => {
  // console.log('update product')
  // console.log('variant',req.body.variants)
  try {
    const product = await Product.findById(req.params.id);
    // console.log("product", product);

    if (product) {
      product.title = { ...product.title, ...req.body.title };
      product.description = {
        ...product.description,
        ...req.body.description,
      };

      product.productId = req.body.productId;
      product.sku = req.body.sku;
      product.hsn = req.body.hsn;
      product.unit = req.body.unit;
      product.brand = req.body.brand;
      product.taxableRate = req.body.taxableRate;
      product.taxPercent = req.body.taxPercent;
      product.barcode = req.body.barcode;
      product.slug = req.body.slug;
      product.categories = req.body.categories;
      product.category = req.body.category;
      product.show = req.body.show;
      product.isCombination = req.body.isCombination;
      product.variants = req.body.variants;
      product.stock = req.body.stock;
      product.prices = req.body.prices;
      product.bulkPricing = req.body.bulkPricing || product.bulkPricing;
      product.promoPricing = req.body.promoPricing || product.promoPricing;
      product.image = req.body.image;
      product.tag = req.body.tag;

      await product.save();
      res.send({ data: product, message: "Product updated successfully!" });
    } else {
      res.status(404).send({
        message: "Product Not Found!",
      });
    }
  } catch (err) {
    res.status(404).send(err.message);
    // console.log('err',err)
  }
};

const updateManyProducts = async (req, res) => {
  try {
    const updatedData = {};
    for (const key of Object.keys(req.body)) {
      if (
        req.body[key] !== "[]" &&
        Object.entries(req.body[key]).length > 0 &&
        req.body[key] !== req.body.ids
      ) {
        // console.log('req.body[key]', typeof req.body[key]);
        updatedData[key] = req.body[key];
      }
    }

    // console.log("updated data", updatedData);

    await Product.updateMany(
      { _id: { $in: req.body.ids } },
      {
        $set: updatedData,
      },
      {
        multi: true,
      }
    );
    res.send({
      message: "Products update successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateStatus = async (req, res) => {
  try {
    const newStatus = req.body.status;
    await Product.updateOne(
      { _id: req.params.id },
      {
        $set: {
          status: newStatus,
        },
      }
    );
    res.status(200).send({
      message: `Product ${newStatus} Successfully!`,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await Product.deleteOne({ _id: req.params.id });
    res.status(200).send({
      message: "Product Deleted Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getShowingStoreProducts = async (req, res) => {
  // console.log("req.body", req);
  try {
    const queryObject = { status: "show" };

    // console.log("getShowingStoreProducts");

    const { category, title, slug } = req.query;

    if (category) {
      // Convert category string to ObjectId if it's a valid ObjectId
      let categoryId = category;
      if (mongoose.Types.ObjectId.isValid(category)) {
        categoryId = new mongoose.Types.ObjectId(category);
      }
      // Use primary category field instead of categories array to ensure products show only in their primary category
      queryObject.category = categoryId;
    }

    const limits = Number(req.query.limit) || 100;

    if (title) {
      // Decode URL-encoded title first
      let decodedTitle;
      try {
        decodedTitle = decodeURIComponent(title);
      } catch (e) {
        // If already decoded or invalid, use as is
        decodedTitle = title;
      }

      // Split into words and create flexible search
      const words = decodedTitle.trim().split(/\s+/).filter(word => word.length > 0);

      if (words.length > 0) {
        // Escape special regex characters for each word
        const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        // Create regex that matches all words (in any order)
        const regexPattern = escapedWords.join('.*');

        // Create regex queries for each language
        const titleQueries = languageCodes.map((lang) => ({
          [`title.${lang}`]: { $regex: regexPattern, $options: "i" },
        }));

        queryObject.$or = titleQueries;
      }
    }
    if (slug) {
      queryObject.slug = { $regex: slug, $options: "i" };
    }

    let products = [];
    let popularProducts = [];
    let discountedProducts = [];
    let relatedProducts = [];
    let reviews = [];

    if (slug) {
      products = await Product.find(queryObject)
        .populate({ path: "category", select: "name _id" })
        .sort({ _id: -1 })
        .limit(limits);
      relatedProducts = await Product.find({
        category: products[0]?.category,
      }).populate({ path: "category", select: "_id name" });
      reviews = await Review.find({ product: products[0]._id }).populate({
        path: "user",
        select: "name image",
      });
    } else if (title || category) {
      products = await Product.find(queryObject)
        .populate({ path: "category", select: "name _id" })
        .sort({ order: 1, _id: -1 })
        .limit(limits);
    } else {
      // When no category/title provided (e.g., "See all"), return ALL products
      products = await Product.find(queryObject)
        .populate({ path: "category", select: "name _id" })
        .sort({ order: 1, _id: -1 });
      // Removed limit to show all products when "See all" is clicked

      // Also include popular and discounted for home page use
      popularProducts = await Product.find({ status: "show" })
        .populate({ path: "category", select: "name _id" })
        .sort({ sales: -1 })
        .limit(20);

      discountedProducts = await Product.find({
        status: "show", // Ensure status "show" for discounted products
        $or: [
          {
            $and: [
              { isCombination: true },
              {
                variants: {
                  $elemMatch: {
                    discount: { $gt: "0.00" },
                  },
                },
              },
            ],
          },
          {
            $and: [
              { isCombination: false },
              {
                $expr: {
                  $gt: [
                    { $toDouble: "$prices.discount" }, // Convert the discount field to a double
                    0,
                  ],
                },
              },
            ],
          },
        ],
      })
        .populate({ path: "category", select: "name _id" })
        .sort({ _id: -1 })
        .limit(20);
    }

    res.send({
      reviews,
      products,
      popularProducts,
      relatedProducts,
      discountedProducts,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const deleteManyProducts = async (req, res) => {
  try {
    const cname = req.cname;
    // console.log("deleteMany", cname, req.body.ids);

    await Product.deleteMany({ _id: req.body.ids });

    res.send({
      message: `Products Delete Successfully!`,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Update product order within a category
const updateProductOrder = async (req, res) => {
  try {
    const { products } = req.body; // Array of { _id, order }

    if (!Array.isArray(products)) {
      return res.status(400).send({
        message: "Products must be an array",
      });
    }

    // Update all products with their new order
    const updatePromises = products.map(({ _id, order }) => {
      return Product.findByIdAndUpdate(
        _id,
        { order: order || 0 },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.status(200).send({
      message: "Product order updated successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Get products grouped by category for admin dashboard
const getProductsByCategory = async (req, res) => {
  try {
    const categories = await Category.find({
      $or: [
        { parentId: { $exists: false } },
        { parentId: null },
        { parentId: "" }
      ]
    }).sort({ order: 1, _id: -1 });

    const result = [];

    for (const category of categories) {
      const products = await Product.find({ category: category._id })
        .populate({ path: "category", select: "_id name" })
        .sort({ order: 1, _id: -1 });

      result.push({
        category: {
          _id: category._id,
          name: category.name,
          icon: category.icon,
          order: category.order,
        },
        products: products,
        productCount: products.length,
      });
    }

    res.send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Get count of products in a category (for delete confirmation)
const getProductCountByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const count = await Product.countDocuments({ category: categoryId });
    res.send({ count });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Delete all products in a category
const deleteProductsByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const result = await Product.deleteMany({ category: categoryId });
    res.send({
      message: `${result.deletedCount} products deleted successfully!`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

module.exports = {
  addProduct,
  addAllProducts,
  getAllProducts,
  getShowingProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  updateManyProducts,
  updateStatus,
  deleteProduct,
  deleteManyProducts,
  getShowingStoreProducts,
  updateProductOrder,
  getProductsByCategory,
  getProductCountByCategory,
  deleteProductsByCategory,
};

