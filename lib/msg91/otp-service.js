/**
 * MSG91 OTP Service
 * Handles sending and verifying OTP using MSG91 API
 * Includes development mode for testing without MSG91
 */

const axios = require("axios");

// MSG91 Configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID; // OTP template ID
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || "KACHAB"; // 6 character sender ID
const MSG91_OTP_EXPIRY = 5; // OTP expiry in minutes

// Development mode: Store OTPs in memory when MSG91 is not configured
const DEV_MODE = !MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID || process.env.OTP_DEV_MODE === "true";
const otpStore = new Map(); // phoneNumber -> { otp, expiry }

/**
 * Send OTP to phone number
 * @param {string} phoneNumber - Phone number with country code (e.g., "919876543210")
 * @returns {Promise<{success: boolean, message: string, otp?: string}>}
 */
const sendOTP = async (phoneNumber) => {
  try {
    // Validate phone number format (should be 10-15 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, ""); // Remove non-digits
    
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return {
        success: false,
        message: "Invalid phone number format",
      };
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Development mode - store OTP locally
    if (DEV_MODE) {
      console.log(`📱 [DEV MODE] OTP for ${cleanPhone}: ${otp}`);
      otpStore.set(cleanPhone, {
        otp,
        expiry: Date.now() + MSG91_OTP_EXPIRY * 60 * 1000,
      });
      return {
        success: true,
        message: "OTP sent successfully (Dev Mode)",
        otp: otp, // Return OTP for development
      };
    }

    // Production mode - use MSG91 API
    // Include sender parameter to avoid error 407 (Invalid Sender ID)
    const url = `https://control.msg91.com/api/v5/otp?authkey=${MSG91_AUTH_KEY}&template_id=${MSG91_TEMPLATE_ID}&mobile=${cleanPhone}&otp=${otp}&otp_expiry=${MSG91_OTP_EXPIRY}&sender=${MSG91_SENDER_ID}`;

    const response = await axios.get(url);

    // MSG91 response structure
    if (response.data.type === "success") {
      console.log(`✅ OTP sent successfully to ${cleanPhone}`);
      // Also store locally for verification fallback
      otpStore.set(cleanPhone, {
        otp,
        expiry: Date.now() + MSG91_OTP_EXPIRY * 60 * 1000,
      });
      return {
        success: true,
        message: "OTP sent successfully",
      };
    } else {
      const errorData = response.data;
      const errorCode = errorData.code || errorData.error || "unknown";
      console.error("MSG91 Error:", errorData);
      
      // Specific handling for error 407 (Invalid Sender ID)
      if (errorCode === 407 || errorCode === "407" || errorData.message?.includes("407")) {
        console.error("❌ MSG91 Error 407: Invalid Sender ID");
        console.error("   - Check if Sender ID is approved in MSG91 dashboard");
        console.error("   - Current Sender ID:", MSG91_SENDER_ID);
        console.error("   - Verify Sender ID matches the approved one in MSG91 account");
        console.error("   - Sender ID must be exactly 6 characters");
      }
      
      // Fallback to dev mode if MSG91 fails
      console.log(`📱 [FALLBACK] OTP for ${cleanPhone}: ${otp}`);
      otpStore.set(cleanPhone, {
        otp,
        expiry: Date.now() + MSG91_OTP_EXPIRY * 60 * 1000,
      });
      return {
        success: true,
        message: "OTP sent (check console for dev OTP)",
        otp: otp, // Return OTP when MSG91 fails
      };
    }
  } catch (error) {
    const errorData = error.response?.data || {};
    const errorCode = errorData.code || errorData.error || "unknown";
    console.error("Error sending OTP via MSG91:", errorData || error.message);
    
    // Specific handling for error 407 (Invalid Sender ID)
    if (errorCode === 407 || errorCode === "407" || error.message?.includes("407")) {
      console.error("❌ MSG91 Error 407: Invalid Sender ID");
      console.error("   - Check if Sender ID is approved in MSG91 dashboard");
      console.error("   - Current Sender ID:", MSG91_SENDER_ID);
      console.error("   - Verify Sender ID matches the approved one in MSG91 account");
      console.error("   - Sender ID must be exactly 6 characters");
    }
    
    // Fallback: Generate and store OTP locally
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`📱 [FALLBACK] OTP for ${cleanPhone}: ${otp}`);
    otpStore.set(cleanPhone, {
      otp,
      expiry: Date.now() + MSG91_OTP_EXPIRY * 60 * 1000,
    });
    
    return {
      success: true,
      message: "OTP sent (check console for dev OTP)",
      otp: otp,
    };
  }
};

/**
 * Verify OTP
 * @param {string} phoneNumber - Phone number with country code
 * @param {string} otp - OTP entered by user
 * @returns {Promise<{success: boolean, message: string}>}
 */
const verifyOTP = async (phoneNumber, otp) => {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, ""); // Remove non-digits

    if (!otp || otp.length !== 4) {
      return {
        success: false,
        message: "Invalid OTP format",
      };
    }

    // Check local OTP store first (for dev mode or fallback)
    const storedOTP = otpStore.get(cleanPhone);
    if (storedOTP) {
      if (Date.now() > storedOTP.expiry) {
        otpStore.delete(cleanPhone);
        return {
          success: false,
          message: "OTP expired. Please request a new one.",
        };
      }
      
      if (storedOTP.otp === otp) {
        otpStore.delete(cleanPhone);
        console.log(`✅ OTP verified successfully for ${cleanPhone} (local)`);
        return {
          success: true,
          message: "OTP verified successfully",
        };
      }
    }

    // Development mode - only check local store
    if (DEV_MODE) {
      return {
        success: false,
        message: "Invalid OTP",
      };
    }

    // Production mode - verify with MSG91 API
    const url = `https://control.msg91.com/api/v5/otp/verify?authkey=${MSG91_AUTH_KEY}&mobile=${cleanPhone}&otp=${otp}`;

    const response = await axios.get(url);

    if (response.data.type === "success") {
      console.log(`✅ OTP verified successfully for ${cleanPhone}`);
      otpStore.delete(cleanPhone); // Clean up local store
      return {
        success: true,
        message: "OTP verified successfully",
      };
    } else {
      return {
        success: false,
        message: response.data.message || "Invalid OTP",
      };
    }
  } catch (error) {
    console.error("Error verifying OTP via MSG91:", error.response?.data || error.message);
    
    // If MSG91 fails, try local verification
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const storedOTP = otpStore.get(cleanPhone);
    if (storedOTP && storedOTP.otp === otp && Date.now() <= storedOTP.expiry) {
      otpStore.delete(cleanPhone);
      return {
        success: true,
        message: "OTP verified successfully",
      };
    }
    
    return {
      success: false,
      message: "Invalid OTP",
    };
  }
};

/**
 * Resend OTP
 * @param {string} phoneNumber - Phone number with country code
 * @returns {Promise<{success: boolean, message: string}>}
 */
const resendOTP = async (phoneNumber) => {
  // Simply send a new OTP
  return sendOTP(phoneNumber);
};

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
};
