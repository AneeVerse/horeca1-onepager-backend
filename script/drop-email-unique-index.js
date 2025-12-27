/**
 * Drops the unique index on `email` in customers collection (if it exists).
 * Use this to fix duplicate key errors on email: null.
 *
 * Run:
 *   node script/drop-email-unique-index.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI not set");
    }

    // ensure we connect to horeca1 db explicitly
    let connectionString = uri;
    if (!connectionString.match(/\/[^\/\?]+(\?|$)/)) {
      connectionString = connectionString.replace(/\/(\?|$)/, "/horeca1$1");
    } else {
      connectionString = connectionString.replace(/\/[^\/\?]+(\?|$)/, "/horeca1$1");
    }

    await mongoose.connect(connectionString);
    console.log("Connected to MongoDB:", mongoose.connection.db.databaseName);

    const indexes = await mongoose.connection.db
      .collection("customers")
      .indexInformation({ full: true });

    const emailIndex = indexes.find(
      (idx) => idx.name === "email_1" || (idx.key && idx.key.email === 1)
    );

    if (emailIndex) {
      console.log("Found email index:", emailIndex);
      await mongoose.connection.db.collection("customers").dropIndex(emailIndex.name);
      console.log("Dropped email index:", emailIndex.name);
    } else {
      console.log("No email index found; nothing to drop.");
    }
  } catch (err) {
    console.error("Error dropping email index:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected");
  }
};

run();








