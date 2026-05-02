require("dotenv").config();
const mongoose = require("mongoose");

let isConnected = false;

// Disable mongoose buffering to prevent timeout errors
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI not set");
  }

  try {
    // Ensure we connect to the horeca1 database
    let connectionString = mongoUri;
    // If the URI doesn't end with a database name, add /horeca1
    if (!connectionString.match(/\/[^\/\?]+(\?|$)/)) {
      connectionString = connectionString.replace(/\/(\?|$)/, '/horeca1$1');
    } else {
      // Replace any existing database name with horeca1
      connectionString = connectionString.replace(/\/[^\/\?]+(\?|$)/, '/horeca1$1');
    }
    
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 8000,  // 8s — fail fast in serverless (Vercel max ~10s)
      socketTimeoutMS: 15000,          // 15s socket timeout
      connectTimeoutMS: 8000,          // 8s connect timeout
      maxPoolSize: 5,                  // Serverless: keep pool small
      minPoolSize: 0,                  // Allow pool to shrink to 0 when idle
      maxIdleTimeMS: 10000,            // 10s idle — release connections quickly
      heartbeatFrequencyMS: 10000,     // Check connection health every 10s
    });
    
    isConnected = true;
    console.log("MongoDB connected to database:", mongoose.connection.db.databaseName);
  } catch (err) {
    console.error("MongoDB failed:", err.message);
    isConnected = false;
    throw err;
  }
};

const ensureConnection = async () => {
  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  
  // Check if connecting
  if (mongoose.connection.readyState === 2) {
    // Wait for connection to complete (max 5 seconds)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      mongoose.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve(true);
      });
      mongoose.connection.once('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }
  
  // Not connected, try to connect
  try {
    await connectDB();
    return mongoose.connection.readyState === 1;
  } catch (error) {
    console.error("ensureConnection error:", error.message);
    return false;
  }
};

module.exports = { connectDB, ensureConnection };
