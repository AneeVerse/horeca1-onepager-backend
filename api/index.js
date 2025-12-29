require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
// const path = require("path");
// const http = require("http");
// const { Server } = require("socket.io");

const { connectDB, ensureConnection } = require("../config/db");
const { ensureDBConnection } = require("../middleware/dbConnection");
const productRoutes = require("../routes/productRoutes");
const reviewRoutes = require("../routes/reviewRoutes");
const customerRoutes = require("../routes/customerRoutes");
const adminRoutes = require("../routes/adminRoutes");
const orderRoutes = require("../routes/orderRoutes");
const customerOrderRoutes = require("../routes/customerOrderRoutes");
const categoryRoutes = require("../routes/categoryRoutes");
const couponRoutes = require("../routes/couponRoutes");
const attributeRoutes = require("../routes/attributeRoutes");
const settingRoutes = require("../routes/settingRoutes");
const currencyRoutes = require("../routes/currencyRoutes");
const languageRoutes = require("../routes/languageRoutes");
const notificationRoutes = require("../routes/notificationRoutes");
const { isAuth, isAdmin } = require("../config/auth");
// const {
//   getGlobalSetting,
//   getStoreCustomizationSetting,
// } = require("../lib/notification/setting");

const app = express();

// Initialize database connection
(async () => {
  try {
    await connectDB();
    console.log("Database connection initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    // Connection will be retried on first request via ensureConnection
  }
})();

// We are using this for the express-rate-limit middleware
// See: https://github.com/nfriedly/express-rate-limit
// app.enable('trust proxy');
app.set("trust proxy", 1);

app.use(express.json({ limit: "4mb" }));
app.use(helmet());
app.options("*", cors()); // include before other routes
app.use(cors());

// Health check endpoint (before other routes)
app.get("/health", async (req, res) => {
  const mongoose = require("mongoose");
  const dbStatus = mongoose.connection.readyState;
  const { ensureConnection } = require("../config/db");
  
  // Try to ensure connection
  let connectionAttempt = null;
  let connectionError = null;
  if (dbStatus !== 1) {
    try {
      connectionAttempt = await ensureConnection();
    } catch (error) {
      connectionError = {
        message: error.message,
        name: error.name,
        code: error.code,
      };
      console.error("Health check connection attempt failed:", error);
    }
  }
  
  res.json({
    status: dbStatus === 1 ? "healthy" : "unhealthy",
    dbConnected: dbStatus === 1,
    dbState: dbStatus, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    connectionAttempt: connectionAttempt,
    connectionError: connectionError,
    hasMongoUri: !!process.env.MONGO_URI,
    mongoUriPreview: process.env.MONGO_URI ? 
      process.env.MONGO_URI.substring(0, 30) + "..." : "NOT SET",
    mongoUriHasDb: process.env.MONGO_URI ? 
      /\/[^\/\?]+/.test(process.env.MONGO_URI.split('@')[1] || '') : false,
  });
});

// Test connection endpoint
app.get("/test-connection", async (req, res) => {
  const { connectDB } = require("../config/db");
  try {
    console.log("Test connection endpoint called");
    await connectDB();
    res.json({
      success: true,
      message: "Connection successful",
      state: require("mongoose").connection.readyState,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      error: {
        name: error.name,
        code: error.code,
      },
    });
  }
});

// Seed default settings endpoint
app.get("/seed-settings", ensureDBConnection, async (req, res) => {
  const Setting = require("../models/Setting");
  
  try {
    const results = [];
    
    // Check and create globalSetting
    let globalSetting = await Setting.findOne({ name: "globalSetting" });
    if (!globalSetting) {
      globalSetting = await Setting.create({
        name: "globalSetting",
        setting: {
          number_of_image_per_product: 4,
          shop_name: "Horeca1",
          address: "Your Address",
          company_name: "Horeca1",
          vat_number: "",
          post_code: "",
          contact: "+099949343",
          email: "support@horeca1.com",
          website: "https://horeca1.com",
          default_currency: "$",
          default_time_zone: "UTC",
          default_date_format: "MMM D, YYYY",
        }
      });
      results.push("globalSetting created");
    } else {
      results.push("globalSetting already exists");
    }
    
    // Check and create storeSetting
    let storeSetting = await Setting.findOne({ name: "storeSetting" });
    if (!storeSetting) {
      storeSetting = await Setting.create({
        name: "storeSetting",
        setting: {
          cod_status: true,
          stripe_status: false,
          razorpay_status: false,
          google_login_status: false,
          facebook_login_status: false,
          github_login_status: false,
          tawk_chat_status: false,
          google_analytic_status: false,
          fb_pixel_status: false,
        }
      });
      results.push("storeSetting created");
    } else {
      results.push("storeSetting already exists");
    }
    
    // Check and create storeCustomizationSetting
    let storeCustomizationSetting = await Setting.findOne({ name: "storeCustomizationSetting" });
    if (!storeCustomizationSetting) {
      storeCustomizationSetting = await Setting.create({
        name: "storeCustomizationSetting",
        setting: {
          navbar: {
            categories_menu_status: true,
            about_menu_status: true,
            contact_menu_status: true,
            offers_menu_status: true,
            term_and_condition_status: true,
            privacy_policy_status: true,
            faq_status: true,
            help_text: "Need help? Call Us:",
            phone_number: "+099949343",
          },
          home: {
            coupon_status: true,
            featured_status: true,
            popular_products_status: true,
            quick_delivery_status: true,
            latest_discounted_status: true,
            daily_needs_status: true,
            feature_promo_status: true,
          },
          slider: {
            left_right_arrow: true,
            bottom_dots: true,
            both_slider_option: false,
          },
          footer: {
            social_facebook: "https://facebook.com",
            social_twitter: "https://twitter.com",
            social_pinterest: "https://pinterest.com",
            social_linkedin: "https://linkedin.com",
            social_instagram: "https://instagram.com",
            social_whatsapp: "",
            payment_method_status: true,
            bottom_contact_status: true,
            bottom_contact_address: "Your Address Here",
            bottom_contact_email: "support@horeca1.com",
            bottom_contact_phone: "+099949343",
          },
          seo: {
            meta_title: "Horeca1 - Online Store",
            meta_description: "Best quality products at affordable prices",
            meta_keywords: "grocery, food, online store",
            meta_url: "https://horeca1.com",
          },
        }
      });
      results.push("storeCustomizationSetting created");
    } else {
      results.push("storeCustomizationSetting already exists");
    }
    
    res.json({
      success: true,
      message: "Settings seeded successfully",
      results: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//root route
app.get("/", (req, res) => {
  res.send("App works properly!");
});

//this for route will need for store front, also for admin dashboard
// Apply DB connection middleware to all routes that need database access
app.use("/v1/products/", ensureDBConnection, productRoutes);
app.use("/v1/reviews/", ensureDBConnection, isAuth, reviewRoutes);
app.use("/v1/category/", ensureDBConnection, categoryRoutes);
app.use("/v1/coupon/", ensureDBConnection, couponRoutes);
app.use("/v1/customer/", ensureDBConnection, customerRoutes);
app.use("/v1/order/", ensureDBConnection, isAuth, customerOrderRoutes);
app.use("/v1/attributes/", ensureDBConnection, attributeRoutes);
app.use("/v1/setting/", ensureDBConnection, settingRoutes);
app.use("/v1/currency/", ensureDBConnection, isAuth, currencyRoutes);
app.use("/v1/language/", ensureDBConnection, languageRoutes);
app.use("/v1/notification/", ensureDBConnection, isAuth, notificationRoutes);

//if you not use admin dashboard then these two route will not needed.
app.use("/v1/admin/", ensureDBConnection, adminRoutes);
app.use("/v1/orders/", ensureDBConnection, isAuth, orderRoutes);

// Use express's default error handling middleware
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(400).json({ message: err.message });
});

// Serve static files from the "dist" directory
app.use("/static", express.static("public"));

// Serve the index.html file for all routes
// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "build", "index.html"));
// });

const PORT = process.env.PORT || 5000;

// const server = http.createServer(app);

app.listen(PORT, () => console.log(`server running on port ${PORT}`));

// app.listen(PORT, () => console.log(`server running on port ${PORT}`));

// set up socket
// const io = new Server(server, {
//   cors: {
//     origin: [
//       "http://localhost:3000",
//       "http://localhost:4100",
//       "https://admin-Horeca1.vercel.app",
//       "https://dashtar-admin.vercel.app",
//       "https://Horeca1-store.vercel.app",
//       "https://Horeca1-admin.netlify.app",
//       "https://dashtar-admin.netlify.app",
//       "https://Horeca1-store-nine.vercel.app",
//     ], //add your origin here instead of this
//     methods: ["PUT", "GET", "POST", "DELETE", "PATCH", "OPTIONS"],
//     credentials: false,
//     transports: ["websocket"],
//   },
// });

// io.on("connection", (socket) => {
//   // console.log(`Socket ${socket.id} connected!`);

//   socket.on("notification", async (data) => {
//     console.log("data", data);
//     try {
//       let updatedData = data;

//       if (data?.option === "storeCustomizationSetting") {
//         const storeCustomizationSetting = await getStoreCustomizationSetting(
//           data
//         );
//         updatedData = {
//           ...data,
//           storeCustomizationSetting: storeCustomizationSetting,
//         };
//       }
//       if (data?.option === "globalSetting") {
//         const globalSetting = await getGlobalSetting(data);
//         updatedData = {
//           ...data,
//           globalSetting: globalSetting,
//         };
//       }
//       io.emit("notification", updatedData);
//     } catch (error) {
//       console.error("Error handling notification:", error);
//     }
//   });

//   socket.on("disconnect", () => {
//     console.log(`Socket ${socket.id} disconnected!`);
//   });
// });
// server.listen(PORT, () => console.log(`server running on port ${PORT}`));
