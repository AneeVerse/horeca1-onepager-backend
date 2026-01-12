const express = require("express");
const router = express.Router();
const {
  loginCustomer,
  refreshToken,
  registerCustomer,
  verifyPhoneNumber,
  signUpWithOauthProvider,
  verifyEmailAddress,
  forgetPassword,
  changePassword,
  resetPassword,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addAllCustomers,
  adminCreateCustomer,
  addShippingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  sendOTPForLogin,
  verifyOTPAndLogin,
  resendOTPForLogin,
} = require("../controller/customerController");
const {
  passwordVerificationLimit,
  emailVerificationLimit,
  phoneVerificationLimit,
} = require("../lib/email-sender/sender");

//verify email
router.post("/verify-email", emailVerificationLimit, verifyEmailAddress);

//verify phone number
router.post("/verify-phone", phoneVerificationLimit, verifyPhoneNumber);

// OTP Authentication (Passwordless)
router.post("/otp/send", sendOTPForLogin);
router.post("/otp/verify", verifyOTPAndLogin);
router.post("/otp/resend", resendOTPForLogin);

// shipping address send to array
router.post("/shipping/address/:id", addShippingAddress);

// get all shipping address
router.get("/shipping/address/:id", getShippingAddress);

// shipping address update
router.put("/shipping/address/:userId/:shippingId", updateShippingAddress);

// shipping address delete
router.delete("/shipping/address/:userId/:shippingId", deleteShippingAddress);

//register a user
router.post("/register/:token", registerCustomer);

//login a user
router.post("/login", loginCustomer);

// refresh token
router.post("/refresh", refreshToken);

//register or login with google and fb
router.post("/signup/oauth", signUpWithOauthProvider);

//forget-password
router.put("/forget-password", passwordVerificationLimit, forgetPassword);

//reset-password
router.put("/reset-password", resetPassword);

//change password
router.post("/change-password", changePassword);

//add all users
router.post("/add/all", addAllCustomers);

//admin create customer (no verification needed)
router.post("/admin/create", adminCreateCustomer);

//get all user
router.get("/", getAllCustomers);

//get a user
router.get("/:id", getCustomerById);

//update a user
router.put("/:id", updateCustomer);

//delete a user
router.delete("/:id", deleteCustomer);

module.exports = router;
