require("dotenv").config();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

// Token for Admin login - 1 year expiry for convenience
const signInToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      image: user.image,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_ADMIN_LIFETIME || "365d", // 1 year for admin
    }
  );
};

// Token for Customer login - 1 year expiry for convenience
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      image: user.image,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_LIFETIME || "365d" } // 1 year for customers
  );
};

// Refresh token - 1 year expiry
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_LIFETIME || "365d" } // 1 year
  );
};

const tokenForVerify = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      password: user.password,
    },
    process.env.JWT_SECRET_FOR_VERIFY,
    { expiresIn: "15m" }
  );
};

const isAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  // console.log("authorization", req.headers);
  console.log(`🔍isAuth ${req.method} : ${req.originalUrl}`);
  try {
    // Check if authorization header exists
    if (!authorization) {
      return res.status(401).send({
        message: "Authorization header is missing",
      });
    }

    const token = authorization.split(" ")[1];

    // Check if token exists after splitting
    if (!token) {
      return res.status(401).send({
        message: "Token is missing from Authorization header",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log("error on isAuth", err);

    res.status(401).send({
      message: err.message || "Authentication failed",
    });
  }
};

// Optional auth: attaches req.user if a valid token is present, but does NOT reject
// if the token is missing or expired. Used for payment/webhook routes where the flow
// must complete even if the customer's session cookie has expired (e.g. long UPI approval).
const optionalAuth = async (req, res, next) => {
  try {
    const { authorization } = req.headers;
    if (authorization) {
      const token = authorization.split(" ")[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
      }
    }
  } catch (err) {
    // Token invalid / expired — intentionally continue without user
    console.log("[optionalAuth] Token invalid or expired, continuing unauthed:", err.message);
  }
  next();
};

const isAdmin = async (req, res, next) => {
  const admin = await Admin.findOne({ role: "Admin" });
  if (admin) {
    next();
  } else {
    res.status(401).send({
      message: "User is not Admin",
    });
  }
};

const secretKey = process.env.ENCRYPT_PASSWORD;

// Ensure the secret key is exactly 32 bytes (256 bits)
const key = crypto.createHash("sha256").update(secretKey).digest();

// Generate an initialization vector (IV)
const iv = crypto.randomBytes(16); // AES-CBC requires a 16-byte IV

// Helper function to encrypt data
const handleEncryptData = (data) => {
  // Ensure the input is a string or convert it to a string
  const dataToEncrypt = typeof data === "string" ? data : JSON.stringify(data);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encryptedData = cipher.update(dataToEncrypt, "utf8", "hex");
  encryptedData += cipher.final("hex");

  return {
    data: encryptedData,
    iv: iv.toString("hex"),
  };
};

module.exports = {
  isAuth,
  optionalAuth,
  isAdmin,
  signInToken,
  tokenForVerify,
  handleEncryptData,
  generateAccessToken,
  generateRefreshToken,
};
