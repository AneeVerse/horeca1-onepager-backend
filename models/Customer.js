const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false, // Will be collected when saving delivery address
    },
    image: {
      type: String,
      required: false,
    },
    address: {
      type: String,
      required: false,
    },
    country: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: false,
    },
    zipCode: {
      type: String,
      required: false,
    },

    shippingAddresses: [{
      name: {
        type: String,
        required: true,
      },
      contact: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: false,
      },
      address: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      area: {
        type: String,
        required: false,
      },
      zipCode: {
        type: String,
        required: true,
      },
      isDefault: {
        type: Boolean,
        default: false,
      },
    }],
    email: {
      type: String,
      required: false, // Collected later; do NOT enforce unique to allow null/duplicates
      lowercase: true,
    },
    phone: {
      type: String,
      required: true, // Phone is now required for OTP auth
      unique: true,
      index: true,
    },
    password: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
