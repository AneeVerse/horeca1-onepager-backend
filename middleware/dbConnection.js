const { ensureConnection } = require("../config/db");

/**
 * Middleware to ensure database connection before handling request
 * This prevents buffering timeout errors in production/serverless environments
 */
const ensureDBConnection = async (req, res, next) => {
  try {
    const connected = await ensureConnection();
    if (!connected) {
      return res.status(503).json({
        message: "Database connection unavailable. Please try again in a moment.",
        error: "Database connection failed"
      });
    }
    next();
  } catch (error) {
    console.error("DB connection middleware error:", error);
    return res.status(503).json({
      message: "Database connection error. Please try again in a moment.",
      error: error.message
    });
  }
};

module.exports = { ensureDBConnection };

