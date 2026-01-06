const mongoose = require("mongoose");
const AutoIncrement = require("mongoose-sequence")(mongoose);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    invoice: {
      type: Number,
      required: false,
    },
    cart: [{}], // <-- Use Mixed for nested objects
    user_info: {
      name: String,
      email: String,
      contact: String,
      address: String,
      city: String,
      country: String,
      zipCode: String,
    },
    subTotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      required: true,
    },
    discount: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    taxableSubtotal: { type: Number, default: 0 },
    vat: { type: Number, default: 0 }, // Alias for totalGst for backward compatibility

    total: {
      type: Number,
      required: true,
    },
    shippingOption: {
      type: String,
      required: false,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    cardInfo: {
      type: Object,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "delivered", "cancel"],
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
