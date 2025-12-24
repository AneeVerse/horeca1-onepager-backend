const { ensureConnection } = require("../config/db");

// Middleware to ensure MongoDB connection before handling requests
const ensureDBConnection = async (req, res, next) => {
  try {
    const isConnected = await ensureConnection();
    if (!isConnected) {
      return res.status(503).json({
        message: "Database connection not ready. Please try again in a moment.",
      });
    }
    next();
  } catch (error) {
    console.error("Database connection middleware error:", error);
    return res.status(503).json({
      message: "Database connection error. Please try again.",
    });
  }
};

module.exports = ensureDBConnection;








