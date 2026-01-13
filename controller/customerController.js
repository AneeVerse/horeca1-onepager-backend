require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const Customer = require("../models/Customer");
const {
  tokenForVerify,
  generateAccessToken,
  generateRefreshToken,
} = require("../config/auth");
const { sendEmail } = require("../lib/email-sender/sender");
const {
  customerRegisterBody,
} = require("../lib/email-sender/templates/register");
const {
  forgetPasswordEmailBody,
} = require("../lib/email-sender/templates/forget-password");
const { sendVerificationCode } = require("../lib/phone-verification/sender");
const { sendOTP, verifyOTP, resendOTP } = require("../lib/msg91/otp-service");

// Helper to standardize Indian phone numbers (handles 10-digit and 91 prefix)
const standardizePhone = (phone) => {
  if (!phone) return null;
  let clean = phone.toString().replace(/\D/g, "");
  // If it's a 10 digit Indian number, add 91 prefix
  if (clean.length === 10) {
    clean = "91" + clean;
  }
  return clean;
};

const verifyEmailAddress = async (req, res) => {
  const isAdded = await Customer.findOne({ email: req.body.email });
  if (isAdded) {
    return res.status(403).send({
      message: "This Email already Added!",
    });
  } else {
    const token = tokenForVerify(req.body);
    const option = {
      name: req.body.name,
      email: req.body.email,
      token: token,
    };
    const body = {
      from: process.env.EMAIL_USER,
      // from: "info@demomailtrap.com",
      to: `${req.body.email}`,
      subject: "Email Activation",
      subject: "Verify Your Email",
      html: customerRegisterBody(option),
    };

    const message = "Please check your email to verify your account!";
    sendEmail(body, res, message);
  }
};

const verifyPhoneNumber = async (req, res) => {
  const phoneNumber = req.body.phone;

  // console.log("verifyPhoneNumber", phoneNumber);

  // Check if phone number is provided and is in the correct format
  if (!phoneNumber) {
    return res.status(400).send({
      message: "Phone number is required.",
    });
  }

  // Optional: Add phone number format validation here (if required)
  // const phoneRegex = /^[0-9]{10}$/; // Basic validation for 10-digit phone numbers
  // if (!phoneRegex.test(phoneNumber)) {
  //   return res.status(400).send({
  //     message: "Invalid phone number format. Please provide a valid number.",
  //   });
  // }

  try {
    const cleanPhone = standardizePhone(phoneNumber);
    // Check if the phone number is already associated with an existing customer
    const isAdded = await Customer.findOne({ phone: cleanPhone });

    if (isAdded) {
      return res.status(403).send({
        message: "This phone number is already added.",
      });
    }

    // Generate a random 4-digit verification code
    const verificationCode = Math.floor(
      1000 + Math.random() * 9000
    ).toString();

    // Send verification code via SMS
    const sent = await sendVerificationCode(phoneNumber, verificationCode);

    if (!sent) {
      return res.status(500).send({
        message: "Failed to send verification code.",
      });
    }

    const message = "Please check your phone for the verification code!";
    return res.send({ message });
  } catch (err) {
    console.error("Error during phone verification:", err);
    res.status(500).send({
      message: err.message,
    });
  }
};

const registerCustomer = async (req, res) => {
  const token = req.params.token;

  try {
    const { name, email, password } = jwt.decode(token);

    // Check if the user is already registered
    const isAdded = await Customer.findOne({ email });

    if (isAdded) {
      const accessToken = generateAccessToken(isAdded);
      const refreshToken = generateRefreshToken(isAdded);
      await isAdded.save();

      return res.send({
        refreshToken,
        token: accessToken,
        _id: isAdded._id,
        name: isAdded.name,
        email: isAdded.email,
        password: password,
        message: "Email Already Verified!",
      });
    }

    if (token) {
      jwt.verify(
        token,
        process.env.JWT_SECRET_FOR_VERIFY,
        async (err, decoded) => {
          if (err) {
            return res.status(401).send({
              message: "Token Expired, Please try again!",
            });
          }

          // Create a new user only if not already registered
          const existingUser = await Customer.findOne({ email });
          console.log("existingUser");

          if (existingUser) {
            return res.status(400).send({ message: "User already exists!" });
          } else {
            const newUser = new Customer({
              name,
              email,
              password: bcrypt.hashSync(password),
            });

            await newUser.save();
            const accessToken = generateAccessToken(newUser);
            const refreshToken = generateRefreshToken(newUser);
            await newUser.save();
            res.send({
              refreshToken,
              token: accessToken,
              _id: newUser._id,
              name: newUser.name,
              email: newUser.email,
              message: "Email Verified, Please Login Now!",
            });
          }
        }
      );
    }
  } catch (error) {
    console.error("Error during email verification:", error);
    res.status(500).send({
      message: "Internal server error. Please try again later.",
    });
  }
};

const addAllCustomers = async (req, res) => {
  try {
    await Customer.deleteMany();
    await Customer.insertMany(req.body);
    res.send({
      message: "Added all users successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Admin Create Customer (No verification required)
const adminCreateCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, city, country, zipCode } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).send({
        message: "Name and phone are required",
      });
    }

    // Standardize phone number (handles 10-digit, 91 prefix, etc.)
    const cleanPhone = standardizePhone(phone);

    // Check if phone number already exists
    const existingCustomer = await Customer.findOne({ phone: cleanPhone });
    if (existingCustomer) {
      return res.status(400).send({
        message: "A customer with this phone number already exists",
      });
    }

    // Create new customer
    const newCustomer = new Customer({
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim() || undefined,
      address: address?.trim() || undefined,
      city: city?.trim() || undefined,
      country: country?.trim() || undefined,
      zipCode: zipCode?.trim() || undefined,
    });

    // Also set shippingAddress for consistency with checkout
    if (address || city || country || zipCode) {
      newCustomer.shippingAddress = {
        name: name.trim(),
        contact: cleanPhone,
        email: email?.trim() || "",
        address: address?.trim() || "",
        city: city?.trim() || "",
        country: country?.trim() || "",
        zipCode: zipCode?.trim() || "",
        isDefault: true,
      };
    }

    await newCustomer.save();

    res.status(201).send({
      message: "Customer created successfully",
      customer: {
        _id: newCustomer._id,
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        address: newCustomer.address,
        city: newCustomer.city,
        country: newCustomer.country,
        zipCode: newCustomer.zipCode,
        shippingAddress: newCustomer.shippingAddress,
        createdAt: newCustomer.createdAt,
        status: "Active",
      },
    });
  } catch (err) {
    console.error("Error creating customer:", err);
    res.status(500).send({
      message: err.message || "Failed to create customer",
    });
  }
};


const loginCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ email: req.body.email });

    // console.log("loginCustomer", req.body.password, "customer", customer);

    if (
      customer &&
      customer.password &&
      bcrypt.compareSync(req.body.password, customer.password)
    ) {
      const accessToken = generateAccessToken(customer);
      const refreshToken = generateRefreshToken(customer);
      await customer.save();

      res.send({
        refreshToken,
        token: accessToken,
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        address: customer.address,
        phone: customer.phone,
        image: customer.image,
      });
    } else {
      res.status(401).send({
        message: "Invalid user or password!",
        error: "Invalid user or password!",
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
      error: "Invalid user or password!",
    });
  }
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await Customer.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    // (Optional) check against DB if you store refresh tokens
    // if (user.refreshToken !== refreshToken) {
    //   return res.status(401).json({ message: "Invalid refresh token" });
    // }

    // Issue new access token
    const accessToken = generateAccessToken(user);

    res.json({
      accessToken,
      expiresIn: 2592000, // 30 days in seconds (30 * 24 * 60 * 60)
      refreshToken, // reuse old, or generateRefreshToken(user) for rotation
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

const forgetPassword = async (req, res) => {
  const isAdded = await Customer.findOne({ email: req.body.email });
  if (!isAdded) {
    return res.status(404).send({
      message: "User Not found with this email!",
    });
  } else {
    const token = tokenForVerify(isAdded);
    const option = {
      name: isAdded.name,
      email: isAdded.email,
      token: token,
    };

    const body = {
      from: process.env.EMAIL_USER,
      to: `${req.body.email}`,
      subject: "Password Reset",
      html: forgetPasswordEmailBody(option),
    };

    const message = "Please check your email to reset password!";
    sendEmail(body, res, message);
  }
};

const resetPassword = async (req, res) => {
  const token = req.body.token;
  const { email } = jwt.decode(token);
  const customer = await Customer.findOne({ email: email });

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET_FOR_VERIFY, (err, decoded) => {
      if (err) {
        return res.status(500).send({
          message: "Token expired, please try again!",
        });
      } else {
        customer.password = bcrypt.hashSync(req.body.newPassword);
        customer.save();
        res.send({
          message: "Your password change successful, you can login now!",
        });
      }
    });
  }
};

const changePassword = async (req, res) => {
  try {
    // console.log("changePassword", req.body);
    const customer = await Customer.findOne({ email: req.body.email });
    if (!customer.password) {
      return res.status(403).send({
        message:
          "For change password,You need to sign up with email & password!",
      });
    } else if (
      customer &&
      bcrypt.compareSync(req.body.currentPassword, customer.password)
    ) {
      customer.password = bcrypt.hashSync(req.body.newPassword);
      await customer.save();
      res.send({
        message: "Your password change successfully!",
      });
    } else {
      res.status(401).send({
        message: "Invalid email or current password!",
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const signUpWithOauthProvider = async (req, res) => {
  try {
    const isAdded = await Customer.findOne({ email: req.body.email });
    let user;

    if (isAdded) {
      user = isAdded;
    } else {
      user = new Customer({
        name: req.body.name,
        email: req.body.email,
        image: req.body.image,
      });
      await user.save();
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await user.save();

    res.send({
      refreshToken,
      token: accessToken,
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const users = await Customer.find({}).sort({ _id: -1 });
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    res.send(customer);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Shipping address create or update
const addShippingAddress = async (req, res) => {
  try {
    const customerId = req.params.id;
    const newShippingAddress = req.body;

    // Extract name and email from shipping address for progressive profile completion
    const { name, email, firstName, lastName } = newShippingAddress;

    // Combine firstName and lastName if name is not provided
    const fullName = name || (firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || lastName);

    // Find the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).send({ message: "Customer not found." });
    }

    // Update customer profile - always update name and email when provided during checkout
    const updateFields = {
      shippingAddress: newShippingAddress,
    };

    // Extract address details for top-level sync
    const { address, city, country, zipCode } = newShippingAddress;

    // Sync top-level fields if they are provided in the shipping address
    if (address) updateFields.address = address;
    if (city) updateFields.city = city;
    if (country) updateFields.country = country;
    if (zipCode) updateFields.zipCode = zipCode;

    // Always update name if provided (not just if empty) - ensures profile updates after order
    if (fullName) {
      updateFields.name = fullName;
    }

    // Always update email if provided (not just if empty) - ensures profile updates after order
    if (email) {
      updateFields.email = email.toLowerCase();
    }

    // #region agent log
    const fs = require('fs');
    const logPath = 'c:\\Users\\Roger\\Desktop\\horeca1\\Horeca1\\.cursor\\debug.log';
    try {
      fs.appendFileSync(logPath, JSON.stringify({ location: 'customerController.js:408', message: 'Updating customer profile', data: { customerId, updateFields, fullName, email }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) + '\n');
    } catch (e) { }
    // #endregion

    // Update the customer
    const result = await Customer.updateOne(
      { _id: customerId },
      { $set: updateFields }
    );

    // #region agent log
    try {
      fs.appendFileSync(logPath, JSON.stringify({ location: 'customerController.js:424', message: 'Customer update result', data: { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount, customerId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) + '\n');
    } catch (e) { }
    // #endregion

    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      // Fetch updated customer to return
      const updatedCustomer = await Customer.findById(customerId);

      // #region agent log
      try {
        fs.appendFileSync(logPath, JSON.stringify({ location: 'customerController.js:432', message: 'Updated customer data', data: { customerId, name: updatedCustomer?.name, email: updatedCustomer?.email, phone: updatedCustomer?.phone }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) + '\n');
      } catch (e) { }
      // #endregion

      return res.send({
        message: "Shipping address added or updated successfully.",
        profileUpdated: !!(fullName || email),
        customer: {
          name: updatedCustomer?.name,
          email: updatedCustomer?.email,
          phone: updatedCustomer?.phone,
        },
      });
    } else {
      return res.status(404).send({ message: "Customer not found." });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getShippingAddress = async (req, res) => {
  try {
    const customerId = req.params.id;
    // const addressId = req.query.id;

    // console.log("getShippingAddress", customerId);
    // console.log("addressId", req.query);

    const customer = await Customer.findById(customerId);

    // If shippingAddress is not set but top-level fields exist, return them as a fallback
    if (customer && !customer.shippingAddress && (customer.address || customer.zipCode)) {
      return res.send({
        shippingAddress: {
          name: customer.name,
          contact: customer.phone,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          country: customer.country,
          zipCode: customer.zipCode,
          isDefault: true,
        }
      });
    }

    res.send({ shippingAddress: customer?.shippingAddress });
  } catch (err) {
    // console.error("Error adding shipping address:", err);
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateShippingAddress = async (req, res) => {
  try {
    const activeDB = req.activeDB;

    const Customer = activeDB.model("Customer", CustomerModel);
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      customer.shippingAddress.push(req.body);

      await customer.save();
      res.send({ message: "Success" });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const deleteShippingAddress = async (req, res) => {
  try {
    const activeDB = req.activeDB;
    const { userId, shippingId } = req.params;

    const Customer = activeDB.model("Customer", CustomerModel);
    await Customer.updateOne(
      { _id: userId },
      {
        $pull: {
          shippingAddress: { _id: shippingId },
        },
      }
    );

    res.send({ message: "Shipping Address Deleted Successfully!" });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { name, email, address, city, country, zipCode, phone, image } = req.body;

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).send({ message: "Customer not found!" });
    }

    if (email && email.trim() !== "") {
      const existingEmailCustomer = await Customer.findOne({ email: email.toLowerCase() });
      if (
        existingEmailCustomer &&
        existingEmailCustomer._id.toString() !== customer._id.toString()
      ) {
        return res.status(400).send({ message: "Email already exists." });
      }
    }

    const cleanPhone = standardizePhone(phone);

    if (cleanPhone) {
      const existingPhone = await Customer.findOne({ phone: cleanPhone });
      if (
        existingPhone &&
        existingPhone._id.toString() !== customer._id.toString()
      ) {
        return res.status(400).send({ message: "Phone number already exists." });
      }
      customer.phone = cleanPhone;
    }

    customer.name = name;
    customer.email = email;
    customer.address = address;
    customer.city = city;
    customer.country = country;
    customer.zipCode = zipCode;
    customer.image = image;

    // Update shippingAddress for consistency
    if (address || city || country || zipCode) {
      customer.shippingAddress = {
        name: name.trim(),
        contact: cleanPhone || customer.phone,
        email: email?.trim() || customer.email || "",
        address: address?.trim() || "",
        city: city?.trim() || "",
        country: country?.trim() || "",
        zipCode: zipCode?.trim() || "",
        isDefault: true,
      };
    }

    await customer.save();

    const accessToken = generateAccessToken(customer);
    const refreshToken = generateRefreshToken(customer);
    await customer.save();

    res.send({
      refreshToken,
      token: accessToken,
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      country: customer.country,
      zipCode: customer.zipCode,
      shippingAddress: customer.shippingAddress,
      phone: customer.phone,
      image: customer.image,
      message: "Customer updated successfully!",
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    // Check if customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).send({
        message: "Customer not found!",
      });
    }

    // Delete the customer
    await Customer.deleteOne({ _id: customerId });

    res.status(200).send({
      message: "User Deleted Successfully!",
    });
  } catch (err) {
    console.error("Error deleting customer:", err);
    res.status(500).send({
      message: err.message || "Failed to delete customer",
    });
  }
};

// ==================== OTP Authentication (Passwordless) ====================

/**
 * Send OTP for login/signup
 * POST /api/customer/otp/send
 * Body: { phone: "919876543210" }
 */
const sendOTPForLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).send({
        message: "Phone number is required",
      });
    }

    // Standardize phone number (handles 10-digit, 91 prefix, etc.)
    const cleanPhone = standardizePhone(phone);

    // Validate phone number format
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).send({
        message: "Invalid phone number format. Please include country code.",
      });
    }

    // Send OTP via MSG91
    const result = await sendOTP(cleanPhone);

    if (!result.success) {
      return res.status(500).send({
        message: result.message || "Failed to send OTP",
      });
    }

    // Return success (include OTP in dev mode for testing)
    const response = {
      message: result.message || "OTP sent successfully",
      phone: cleanPhone, // Return cleaned phone for frontend
    };

    // Include OTP in response for dev/testing mode
    if (result.otp) {
      response.otp = result.otp;
    }

    res.send(response);
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).send({
      message: err.message || "Failed to send OTP",
    });
  }
};

/**
 * Verify OTP and login/signup user
 * POST /api/customer/otp/verify
 * Body: { phone: "919876543210", otp: "123456" }
 */
const verifyOTPAndLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    console.log(`📞 [verifyOTPAndLogin] Received request - phone: ${phone}, otp: ${otp}`);

    if (!phone || !otp) {
      return res.status(400).send({
        message: "Phone number and OTP are required",
      });
    }

    // Standardize phone number
    const cleanPhone = standardizePhone(phone);
    console.log(`📞 [verifyOTPAndLogin] Cleaned phone: ${cleanPhone}`);

    // Verify OTP via MSG91
    const verifyResult = await verifyOTP(cleanPhone, otp);
    console.log(`📞 [verifyOTPAndLogin] OTP verify result:`, verifyResult);

    if (!verifyResult.success) {
      console.log(`❌ [verifyOTPAndLogin] OTP verification failed`);
      return res.status(400).send({
        message: verifyResult.message || "Invalid OTP",
      });
    }

    // Check if user exists
    console.log(`📞 [verifyOTPAndLogin] Looking for customer with phone: ${cleanPhone}`);
    let customer = await Customer.findOne({ phone: cleanPhone });
    console.log(`📞 [verifyOTPAndLogin] Customer found:`, customer ? customer._id : "NOT FOUND");

    // If user doesn't exist, create new user silently
    if (!customer) {
      console.log(`📞 [verifyOTPAndLogin] Creating new customer...`);
      customer = new Customer({
        phone: cleanPhone,
        // name and email will be collected later when saving delivery address
      });
      try {
        await customer.save();
        console.log(`✅ New user created: ${cleanPhone}, ID: ${customer._id}`);
      } catch (saveError) {
        console.error(`❌ [verifyOTPAndLogin] Failed to save customer:`, saveError);
        throw saveError;
      }
    }

    // Generate tokens
    console.log(`📞 [verifyOTPAndLogin] Generating tokens for customer: ${customer._id}`);
    const accessToken = generateAccessToken(customer);
    const refreshToken = generateRefreshToken(customer);
    console.log(`📞 [verifyOTPAndLogin] Tokens generated, accessToken length: ${accessToken?.length}`);

    // Return user data and tokens
    const responseData = {
      refreshToken,
      token: accessToken,
      _id: customer._id,
      name: customer.name || null,
      email: customer.email || null,
      phone: customer.phone,
      address: customer.address || null,
      image: customer.image || null,
      isNewUser: !customer.name || !customer.email, // Flag to indicate if profile needs completion
      message: customer.name ? "Login successful" : "Account created successfully",
    };
    console.log(`📞 [verifyOTPAndLogin] Sending response:`, { ...responseData, token: '[HIDDEN]', refreshToken: '[HIDDEN]' });
    res.send(responseData);
  } catch (err) {
    console.error("❌ [verifyOTPAndLogin] Error:", err);
    res.status(500).send({
      message: err.message || "Failed to verify OTP",
    });
  }
};

/**
 * Resend OTP
 * POST /api/customer/otp/resend
 * Body: { phone: "919876543210" }
 */
const resendOTPForLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).send({
        message: "Phone number is required",
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");

    const result = await resendOTP(cleanPhone);

    if (!result.success) {
      return res.status(500).send({
        message: result.message || "Failed to resend OTP",
      });
    }

    res.send({
      message: "OTP resent successfully",
      phone: cleanPhone,
    });
  } catch (err) {
    console.error("Error resending OTP:", err);
    res.status(500).send({
      message: err.message || "Failed to resend OTP",
    });
  }
};

module.exports = {
  loginCustomer,
  refreshToken,
  verifyPhoneNumber,
  registerCustomer,
  addAllCustomers,
  adminCreateCustomer,
  signUpWithOauthProvider,
  verifyEmailAddress,
  forgetPassword,
  changePassword,
  resetPassword,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addShippingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  // OTP Authentication
  sendOTPForLogin,
  verifyOTPAndLogin,
  resendOTPForLogin,
};
