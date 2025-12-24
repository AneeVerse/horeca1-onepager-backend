//models
const Setting = require("../models/Setting");
const { ensureConnection } = require("../config/db");

//global setting controller
const addGlobalSetting = async (req, res) => {
  try {
    const newGlobalSetting = new Setting(req.body);
    await newGlobalSetting.save();
    res.send({
      message: "Global Setting Added Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getGlobalSetting = async (req, res) => {
  try {
    // Ensure MongoDB connection is ready
    const isConnected = await ensureConnection();
    if (!isConnected) {
      return res.status(503).send({
        message: "Database connection not ready. Please try again in a moment.",
      });
    }

    const globalSetting = await Setting.findOne({ name: "globalSetting" });
    
    if (!globalSetting) {
      return res.status(404).send({
        message: "Global setting not found",
      });
    }

    res.send(globalSetting.setting);
  } catch (err) {
    console.error("getGlobalSetting error:", err);
    res.status(500).send({
      message: err.message || "Failed to fetch global settings",
    });
  }
};

const updateGlobalSetting = async (req, res) => {
  try {
    const { setting } = req.body;

    // Construct the $set object dynamically
    const setObject = Object.keys(setting).reduce((acc, key) => {
      acc[`setting.${key}`] = setting[key];
      return acc;
    }, {});

    const globalSetting = await Setting.findOneAndUpdate(
      { name: "globalSetting" },
      { $set: setObject },
      { new: true, upsert: true }
    );

    res.send({
      data: globalSetting,
      message: "Global Setting Update Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

//store setting controller
const addStoreSetting = async (req, res) => {
  try {
    const newStoreSetting = new Setting(req.body);
    await newStoreSetting.save();
    res.send({
      message: "Store Setting Added Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getStoreSetting = async (req, res) => {
  try {
    // Ensure MongoDB connection is ready
    const isConnected = await ensureConnection();
    if (!isConnected) {
      return res.status(503).send({
        message: "Database connection not ready. Please try again in a moment.",
      });
    }

    const storeSetting = await Setting.findOne({ name: "storeSetting" });

    // console.log("storeSetting", req.query);

    if (!storeSetting) {
      return res.status(404).send({ message: "Store setting not found!" });
    }
    if (req.query.filter === "all") {
      return res.send(storeSetting.setting);
    }

    const {
      cod_status,
      fb_pixel_key,
      fb_pixel_status,
      google_analytic_key,
      google_analytic_status,
      google_login_status,
      meta_url,
      razorpay_id,
      razorpay_status,
      stripe_key,
      stripe_status,
      tawk_chat_property_id,
      tawk_chat_status,
      tawk_chat_widget_id,
      facebook_login_status,
      github_login_status,
    } = storeSetting.setting;

    res.send({
      cod_status,
      fb_pixel_key,
      fb_pixel_status,
      google_analytic_key,
      google_analytic_status,
      google_login_status,
      meta_url,
      razorpay_id,
      razorpay_status,
      stripe_key,
      stripe_status,
      tawk_chat_property_id,
      tawk_chat_status,
      tawk_chat_widget_id,
      facebook_login_status,
      github_login_status,
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const getStoreSecretKeys = async (req, res) => {
  try {
    const storeSetting = await Setting.findOne({ name: "storeSetting" });

    if (!storeSetting) {
      return res.status(404).send({ message: "Store setting not found!" });
    }

    const {
      google_id,
      google_secret,
      facebook_id,
      facebook_secret,
      github_id,
      github_secret,
      razorpay_id,
      razorpay_secret,
      stripe_secret,
      nextauth_secret,
    } = storeSetting.setting;

    res.send({
      google_id,
      google_secret,
      facebook_id,
      facebook_secret,
      github_id,
      github_secret,
      razorpay_id,
      razorpay_secret,
      stripe_secret,
      nextauth_secret,
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const updateStoreSetting = async (req, res) => {
  try {
    const { setting } = req.body;

    // Dynamically build the update fields
    const updateFields = Object.keys(setting).reduce((acc, key) => {
      acc[`setting.${key}`] = setting[key];
      return acc;
    }, {});
    // Update the online store setting document
    const storeSetting = await Setting.findOneAndUpdate(
      { name: "storeSetting" },
      { $set: updateFields },
      { new: true, upsert: true } // upsert to create the document if it doesn't exist
    );

    res.send({
      data: storeSetting,
      message: "Store Setting Update Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

//online store customization controller
const addStoreCustomizationSetting = async (req, res) => {
  try {
    const newStoreCustomizationSetting = new Setting(req.body);
    const storeCustomizationSetting = await newStoreCustomizationSetting.save();

    res.send({
      data: storeCustomizationSetting,
      message: "Online Store Customization Setting Added Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getStoreCustomizationSetting = async (req, res) => {
  try {
    // Ensure MongoDB connection is ready
    const isConnected = await ensureConnection();
    if (!isConnected) {
      return res.status(503).send({
        message: "Database connection not ready. Please try again in a moment.",
      });
    }

    // const { key, keyTwo } = req.query;
    // console.log("getStoreCustomizationSetting");

    // console.log("req query", req.query, "key", key, "keyTwo", keyTwo);

    // let projection = {};
    // if (key) {
    //   projection[`setting.${key}`] = 1;
    // }
    // if (keyTwo) {
    //   projection[`setting.${keyTwo}`] = 1;
    // }

    // // If neither key nor keyTwo is provided, fetch all settings
    // if (!key && !keyTwo) {
    //   projection = { setting: 1 };
    // }

    const storeCustomizationSetting = await Setting.findOne(
      { name: "storeCustomizationSetting" }
      // projection
    );

    if (!storeCustomizationSetting) {
      return res.status(404).send({ message: "Settings not found" });
    }

    // #region agent log
    const quickDeliverySubtitle = storeCustomizationSetting.setting?.home?.quick_delivery_subtitle?.en;
    const quickDeliveryDescription = storeCustomizationSetting.setting?.home?.quick_delivery_description?.en;
    fetch('http://127.0.0.1:7243/ingest/7c8b8306-06cf-4e61-b56f-4a46c890ce31',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend/controller/settingController.js:271',message:'API returning storeCustomizationSetting',data:{quickDeliverySubtitle,quickDeliveryDescription},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    res.send(storeCustomizationSetting.setting);
  } catch (err) {
    console.error("getStoreCustomizationSetting error:", err);
    res.status(500).send({ 
      message: err.message || "Failed to fetch store customization settings" 
    });
  }
};

const getStoreSeoSetting = async (req, res) => {
  // console.log("getStoreSeoSetting");
  try {
    const storeCustomizationSetting = await Setting.findOne(
      {
        name: "storeCustomizationSetting",
      },
      { "setting.seo": 1, _id: 0 }
    );
    // console.log("storeCustomizationSetting", storeCustomizationSetting);
    res.send(storeCustomizationSetting?.setting);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateStoreCustomizationSetting = async (req, res) => {
  try {
    const { setting } = req.body;

    // Dynamically build the update fields
    const updateFields = Object.keys(setting).reduce((acc, key) => {
      acc[`setting.${key}`] = setting[key];
      return acc;
    }, {});
    // Update the online store setting document
    const storeCustomizationSetting = await Setting.findOneAndUpdate(
      { name: "storeCustomizationSetting" },
      { $set: updateFields },
      { new: true, upsert: true } // upsert to create the document if it doesn't exist
    );

    res.send({
      data: storeCustomizationSetting,
      message: "Online Store Customization Setting Update Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

module.exports = {
  addGlobalSetting,
  getGlobalSetting,
  updateGlobalSetting,
  addStoreSetting,
  getStoreSetting,
  getStoreSecretKeys,
  updateStoreSetting,
  getStoreSeoSetting,
  addStoreCustomizationSetting,
  getStoreCustomizationSetting,
  updateStoreCustomizationSetting,
};
