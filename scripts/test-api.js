/**
 * ============================================================
 *  Horeca1 Backend — Postman-style API Test Script
 *  Run: node scripts/test-api.js
 * ============================================================
 *  Tests covered:
 *  1. Address Flow
 *     a) Login a test user (OTP or password)
 *     b) Add a NON-default address → verify it is stored correctly
 *     c) Checkout with that non-default address → should succeed
 *     d) Checkout with NO address / incomplete address → should block (400)
 *
 *  2. Stock Race Condition
 *     Simulates two concurrent checkout requests for the same
 *     product whose stock = 1.  Exactly one should succeed (201)
 *     and the other should get 409 "sold out" or similar.
 *
 *  3. Admin — Query refund_required orders
 *     Fetches all orders with status=refund_required so the admin
 *     can identify which ones need a manual Razorpay refund.
 * ============================================================
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const http  = require("http");
const https = require("https");

// ─── CONFIG ────────────────────────────────────────────────
const BASE = process.env.TEST_BASE_URL || "http://localhost:5055";

// A customer that already exists in DB (OTP login) — phone only
const TEST_PHONE = process.env.TEST_PHONE || "9999999999"; // 10-digit

// Admin JWT (set ADMIN_TOKEN env or the script skips admin checks)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// ─── HELPERS ───────────────────────────────────────────────
const colors = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
};

const pass  = (msg) => console.log(`${colors.green}  ✅ PASS${colors.reset}  ${msg}`);
const fail  = (msg) => console.log(`${colors.red}  ❌ FAIL${colors.reset}  ${msg}`);
const info  = (msg) => console.log(`${colors.cyan}  ℹ  INFO${colors.reset}  ${msg}`);
const warn  = (msg) => console.log(`${colors.yellow}  ⚠  WARN${colors.reset}  ${msg}`);
const head  = (msg) => console.log(`\n${colors.bold}${colors.cyan}══ ${msg} ══${colors.reset}`);

/** Generic HTTP helper — returns { status, body } */
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url      = new URL(BASE + path);
    const isHttps  = url.protocol === "https:";
    const lib      = isHttps ? https : http;
    const payload  = body ? JSON.stringify(body) : null;

    const options = {
      hostname : url.hostname,
      port     : url.port || (isHttps ? 443 : 80),
      path     : url.pathname + url.search,
      method,
      headers  : {
        "Content-Type"  : "application/json",
        "Accept"        : "application/json",
        ...(payload && { "Content-Length": Buffer.byteLength(payload) }),
        ...(token  && { "Authorization": `Bearer ${token}` }),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── STATE SHARED ACROSS TESTS ─────────────────────────────
// Allow pre-seeding from env vars (set by inspect-db.js output)
let userToken   = process.env.USER_TOKEN   || "";
let customerId  = process.env.CUSTOMER_ID  || "";
let addedAddressId = "";
let testProductId  = process.env.PRODUCT_ID || "";   // filled in step 2-setup

// ─── STEP 0 — Health check ─────────────────────────────────
async function healthCheck() {
  head("STEP 0 — Health Check");
  const r = await request("GET", "/health");
  if (r.status === 200 && r.body.dbConnected) {
    pass(`Backend healthy. DB state: ${r.body.dbState}`);
  } else {
    fail(`Backend unhealthy! status=${r.status} body=${JSON.stringify(r.body)}`);
    throw new Error("Backend not ready");
  }
}

// ─── STEP 1 — Login via OTP (send + verify) ────────────────
async function loginViaOTP() {
  head("STEP 1 — Login via OTP");

  // If tokens were pre-seeded (from inspect-db.js output), skip live OTP
  if (userToken && customerId) {
    pass(`Using pre-seeded token. customerId=${customerId}`);
    return;
  }

  // 1a. Send OTP
  info(`Sending OTP to ${TEST_PHONE} …`);
  const sendRes = await request("POST", "/v1/customer/otp/send", { phone: TEST_PHONE });
  console.log(`       status=${sendRes.status}  body=${JSON.stringify(sendRes.body)}`);

  if (sendRes.status !== 200) {
    // If phone doesn't exist in DB, create the user first
    warn("OTP send failed — phone may not exist. Trying admin-create …");
    const createRes = await request("POST", "/v1/customer/admin/create", {
      name      : "Test User",
      outletName: "Test Outlet",
      phone     : TEST_PHONE,
      address   : "123 Test Street",
      city      : "Mumbai",
      country   : "India",
      zipCode   : "400001",
    });
    console.log(`       create status=${createRes.status}  body=${JSON.stringify(createRes.body)}`);
    if (createRes.status === 201) {
      customerId = createRes.body.customer._id;
      pass(`Test customer created: ${customerId}`);
    } else if (createRes.status === 400 && createRes.body.message?.includes("already exists")) {
      // phone exists but OTP failed for another reason — just look it up
      warn("Customer exists but OTP unavailable. Fetching from /v1/customer/ …");
      const listRes = await request("GET", "/v1/customer/");
      if (listRes.status === 200) {
        const standardPhone = TEST_PHONE.length === 10 ? "91" + TEST_PHONE : TEST_PHONE;
        const found = listRes.body.find(c => c.phone === standardPhone || c.phone === TEST_PHONE);
        if (found) {
          customerId = found._id;
          pass(`Found customer: ${customerId}`);
        }
      }
    }

    // Re-send OTP now customer exists
    const retry = await request("POST", "/v1/customer/otp/send", { phone: TEST_PHONE });
    console.log(`       retry status=${retry.status}  body=${JSON.stringify(retry.body)}`);
    if (retry.status !== 200) {
      warn("OTP send still failing — MSG91 may be unreachable. Continuing with no token (address & stock tests will run as best-effort).");
      return; // graceful skip — admin tests still run
    }
  }

  // 1b. Prompt for OTP (non-interactive: read from TEST_OTP env var if set)
  const otp = process.env.TEST_OTP;
  if (!otp) {
    warn("TEST_OTP env var not set. Skipping OTP verify step.");
    warn("To get a token: set TEST_OTP=<code from SMS> and re-run.");
    // Still try to get userId for admin tests by fetching customer list
    const listRes = await request("GET", "/v1/customer/");
    if (listRes.status === 200) {
      const standardPhone = TEST_PHONE.length === 10 ? "91" + TEST_PHONE : TEST_PHONE;
      const found = listRes.body.find(c => c.phone === standardPhone || c.phone === TEST_PHONE);
      if (found) customerId = found._id;
    }
    return;
  }

  const verifyRes = await request("POST", "/v1/customer/otp/verify", {
    phone: TEST_PHONE,
    otp,
  });
  console.log(`       verify status=${verifyRes.status}  body=${JSON.stringify(verifyRes.body)}`);

  if (verifyRes.status === 200 && verifyRes.body.token) {
    userToken  = verifyRes.body.token;
    customerId = verifyRes.body._id || verifyRes.body.user?._id;
    pass(`Logged in. customerId=${customerId}`);
  } else {
    fail(`OTP verify failed: ${JSON.stringify(verifyRes.body)}`);
  }
}

// ─── STEP 2 — Address Flow ─────────────────────────────────
async function testAddressFlow() {
  head("STEP 2 — Address Flow");

  if (!customerId) {
    warn("No customerId — skipping address tests.");
    return;
  }

  // 2a. Get current addresses
  info("Fetching current shipping addresses …");
  const getRes = await request("GET", `/v1/customer/shipping/address/${customerId}`);
  console.log(`       status=${getRes.status}  addresses=${JSON.stringify(getRes.body.shippingAddresses?.length ?? getRes.body)}`);
  if (getRes.status === 200) pass("GET /shipping/address works");
  else fail(`GET /shipping/address returned ${getRes.status}`);

  // 2b. Add a NON-default address (isDefault is set by backend based on position,
  //     but after the first address already exists it should be non-default)
  info("Adding a non-default address …");
  const addRes = await request("POST", `/v1/customer/shipping/address/${customerId}`, {
    name    : "Second Address Tester",
    contact : "9876543210",
    address : "456 Secondary Lane",
    city    : "Pune",
    country : "India",
    zipCode : "411001",
  });
  console.log(`       status=${addRes.status}  body=${JSON.stringify(addRes.body)}`);

  if (addRes.status === 200) {
    pass("Address added successfully");
    const addresses = addRes.body.shippingAddresses || [];
    const added = addresses.find(a => a.zipCode === "411001");
    if (added) {
      addedAddressId = added._id?.toString();
      const isDefault = added.isDefault;
      if (!isDefault) {
        pass(`New address isDefault=false ✓ (addressId: ${addedAddressId})`);
      } else {
        warn(`New address isDefault=true (expected false if another address already existed)`);
      }
    }
  } else {
    fail(`Add address failed: ${JSON.stringify(addRes.body)}`);
  }

  // 2c. Verify: get addresses again and confirm new one is listed
  const getRes2 = await request("GET", `/v1/customer/shipping/address/${customerId}`);
  const all = getRes2.body.shippingAddresses || [];
  const found = all.find(a => a.zipCode === "411001");
  if (found) pass(`Non-default address (411001) present in list. Total addresses: ${all.length}`);
  else       fail(`Non-default address (411001) NOT found after add`);

  // 2d. Set it as default explicitly
  if (addedAddressId) {
    info(`Setting address ${addedAddressId} as default …`);
    const defRes = await request("PUT", `/v1/customer/shipping/address/${customerId}/${addedAddressId}/default`);
    if (defRes.status === 200) {
      pass("set-default succeeded");
      const nowDefault = (defRes.body.shippingAddresses || []).find(a => a._id?.toString() === addedAddressId);
      if (nowDefault?.isDefault) pass("isDefault=true confirmed on the selected address");
      else                       fail("isDefault still false after set-default call");
    } else {
      fail(`set-default returned ${defRes.status}: ${JSON.stringify(defRes.body)}`);
    }
  }

  // 2e. COD checkout with that address (non-default → now promoted to default)
  //     Use a HIGH-stock product so we don’t accidentally drain the stock=1 race product.
  info("Fetching a high-stock product for checkout test …");
  let checkoutProduct = null;
  const prodRes = await request("GET", "/v1/products/?status=show&limit=20");
  if (prodRes.status === 200) {
    const prods = prodRes.body.products || prodRes.body;
    if (Array.isArray(prods)) {
      // Pick a product with plenty of stock (>= 5) and not the race product
      checkoutProduct = prods.find(p => p.stock >= 5 && p._id?.toString() !== process.env.PRODUCT_ID)
        || prods.find(p => p.stock > 0 && p._id?.toString() !== process.env.PRODUCT_ID)
        || prods[0];
    }
  }

  if (!checkoutProduct) {
    warn("No visible product found — skipping checkout sub-tests.");
  } else {
    info(`Using product for checkout: "${resolveTitle(checkoutProduct.title)}" (stock: ${checkoutProduct.stock})`);

    if (userToken) {
      // 2f. Checkout with the address → 201 expected
      info("Attempting COD checkout with the non-default address …");
      const orderPayload = buildOrderPayload(checkoutProduct, {
        name   : "Second Address Tester",
        address: "456 Secondary Lane",
        city   : "Pune",
        zipCode: "411001",
        country: "India",
        contact: "9876543210",
        email  : "test@horeca1.com",
      });
      const orderRes = await request("POST", "/v1/order/add", orderPayload, userToken);
      console.log(`       status=${orderRes.status}  body=${JSON.stringify(orderRes.body).slice(0,200)}`);
      if (orderRes.status === 201) pass("Checkout with non-default address succeeded (201)");
      else if (orderRes.status === 409) fail(`Stock error during checkout: ${orderRes.body.message}`);
      else fail(`Unexpected status ${orderRes.status}: ${JSON.stringify(orderRes.body)}`);

      // 2g. Checkout with NO address → must block
      info("Attempting COD checkout with MISSING address (should block) …");
      const badPayload = buildOrderPayload(checkoutProduct, {
        name   : "",    // empty
        address: "",    // empty
        city   : "",
        zipCode: "",    // invalid
        contact: "9876543210",
        email  : "test@horeca1.com",
      });
      const badRes = await request("POST", "/v1/order/add", badPayload, userToken);
      console.log(`       status=${badRes.status}  body=${JSON.stringify(badRes.body)}`);
      if (badRes.status === 400) pass(`No-address checkout correctly blocked (400): "${badRes.body.message}"`);
      else fail(`Expected 400 but got ${badRes.status}: ${JSON.stringify(badRes.body)}`);
    } else {
      warn("No userToken — skipping checkout sub-tests (need OTP login).");
    }
  }
}

// ─── STEP 3 — Stock Race Condition ─────────────────────────
async function testStockRace() {
  head("STEP 3 — Stock Race Condition (concurrent checkout)");

  if (!userToken) {
    warn("No userToken — skipping stock race test.");
    return;
  }

  // 3a. Always use the env-specified PRODUCT_ID for the race test (set to stock=1)
  const raceProductId = process.env.PRODUCT_ID || testProductId;
  let product;

  if (!raceProductId) {
    warn("No PRODUCT_ID set — skipping race test. Set PRODUCT_ID=<id> env var.");
    return;
  }

  const pr = await request("POST", `/v1/products/${raceProductId}`);
  if (pr.status === 200 && pr.body._id) {
    product = pr.body;
  } else {
    // fallback: search list
    const lr = await request("GET", "/v1/products/");
    const prods = lr.body.products || lr.body;
    product = Array.isArray(prods) ? prods.find(p => p._id?.toString() === raceProductId) : null;
    if (!product) {
      warn(`Could not load race product ${raceProductId} (status=${pr.status}). Trying stock endpoint …`);
      return;
    }
  }

  const originalStock = product.stock;
  info(`Product: "${resolveTitle(product.title)}" — current stock: ${originalStock}`);

  if (originalStock < 1) {
    warn("Product is already out of stock. Cannot run race test meaningfully.");
    return;
  }

  // 3b. If stock > 1 warn that we need it to be 1 for a true race test
  if (originalStock > 1) {
    warn(`Stock is ${originalStock}. For a TRUE race test you should set stock=1 via Admin → Products → Edit.`);
    warn("Running concurrent test anyway — at most one order will be blocked only if stock became 0 mid-race.");
  }

  // 3c. Fire two concurrent POST /v1/order/add requests
  info(`Firing 2 concurrent COD checkout requests for "${resolveTitle(product.title)}" (stock=${product.stock}) …`);
  const addr = {
    name   : "Race Tester",
    address: "789 Race Street",
    city   : "Delhi",
    zipCode: "110001",
    country: "India",
    contact: "9000000000",
    email  : "race@horeca1.com",
  };
  const payload = buildOrderPayload(product, addr);

  const [r1, r2] = await Promise.all([
    request("POST", "/v1/order/add", payload, userToken),
    request("POST", "/v1/order/add", payload, userToken),
  ]);

  console.log(`       Request 1: status=${r1.status}  msg=${r1.body?.message || r1.body?._id || JSON.stringify(r1.body).slice(0,120)}`);
  console.log(`       Request 2: status=${r2.status}  msg=${r2.body?.message || r2.body?._id || JSON.stringify(r2.body).slice(0,120)}`);

  const statuses = [r1.status, r2.status].sort();

  if (statuses[0] === 201 && statuses[1] === 201) {
    if (originalStock >= 2) {
      warn("Both succeeded — stock was ≥2, race not proven. This shouldn't happen with stock=1.");
      warn(`  Recheck: run 'node scripts/set-stock.js ${raceProductId} 1' then re-run.`);
    } else {
      fail("BOTH requests got 201 even though stock=1 — RACE CONDITION BUG! Atomic stock guard is not working.");
    }
  } else if (statuses.includes(201) && (statuses.includes(409) || statuses.includes(400))) {
    pass("Race condition handled correctly — 1 success, 1 blocked ✓");
    const winner   = r1.status === 201 ? "Request 1" : "Request 2";
    const loserMsg = r1.status === 201 ? (r2.body?.message || "") : (r1.body?.message || "");
    const loserSt  = r1.status === 201 ? r2.status : r1.status;
    pass(`  Winner : ${winner} → 201 Created`);
    pass(`  Blocked: other request → ${loserSt} "${loserMsg}"`);
  } else {
    warn(`Unexpected status pair: ${r1.status} / ${r2.status}`);
    if (r1.status === 409 && r2.status === 409) {
      warn("  Both blocked — stock was already 0 before the test ran.");
      warn(`  Reset with: node scripts/set-stock.js ${raceProductId} 1`);
    }
  }
}

// ─── STEP 4 — Admin: Query refund_required orders ──────────
async function testAdminRefundRequired() {
  head("STEP 4 — Admin: Query refund_required Orders");

  if (!ADMIN_TOKEN) {
    warn("ADMIN_TOKEN env var not set. Using unauthenticated admin route (works if isAuth is skipped for GET /v1/orders/).");
  }

  // GET /v1/orders/ — fetches all orders (admin route, isAuth required)
  const allRes = await request("GET", "/v1/orders/", null, ADMIN_TOKEN);
  console.log(`       GET /v1/orders/ → status=${allRes.status}`);

  if (allRes.status === 401) {
    warn("Admin route returned 401. Set ADMIN_TOKEN=<your admin JWT> to run this test.");
    // Try the public customer-order route as fallback
    const fallback = await request("GET", "/v1/orders/?status=refund_required", null, ADMIN_TOKEN);
    console.log(`       fallback status=${fallback.status}`);
    return;
  }

  let orders = [];
  if (Array.isArray(allRes.body)) {
    orders = allRes.body;
  } else if (allRes.body?.orders) {
    orders = allRes.body.orders;
  }

  const refundOrders = orders.filter(o => o.status === "refund_required");

  if (refundOrders.length === 0) {
    pass("No orders with status=refund_required found (clean state) ✓");
  } else {
    warn(`Found ${refundOrders.length} order(s) with status=refund_required — these need manual Razorpay refunds!`);
    refundOrders.forEach((o, i) => {
      console.log(`\n  [${i+1}] Order ID    : ${o._id}`);
      console.log(`       Invoice     : #${o.invoice}`);
      console.log(`       Total       : ₹${o.total}`);
      console.log(`       Customer    : ${o.user_info?.name || o.user} (${o.user_info?.email || ""})`);
      console.log(`       RzpPaymentId: ${o.razorpay?.razorpayPaymentId || "N/A"}`);
      console.log(`       RzpOrderId  : ${o.razorpay?.razorpayOrderId  || "N/A"}`);
      console.log(`       Flagged At  : ${o.stockFailure?.flaggedAt || "N/A"}`);
      console.log(`       Note        : ${o.stockFailure?.note || "N/A"}`);
      console.log(`       Failed Items: ${JSON.stringify(o.stockFailure?.failedItems || [])}`);
      console.log(`\n  👉 Razorpay Dashboard → Payments → Search "${o.razorpay?.razorpayPaymentId}" → Refund`);
    });
  }

  // Also check pending payments (admin recovery tool)
  info("Checking PendingPayments with status=failed …");
  const ppRes = await request("GET", "/v1/orders/pending-payments", null, ADMIN_TOKEN);
  if (ppRes.status === 200) {
    // Response shape can be array OR { pendingPayments: [...] }
    const rawList = Array.isArray(ppRes.body)
      ? ppRes.body
      : (ppRes.body?.pendingPayments || ppRes.body?.data || []);
    const failed = rawList.filter(p => p.status === "failed");
    if (failed.length === 0) {
      pass(`No failed PendingPayments. (total in list: ${rawList.length})`);
    } else {
      warn(`${failed.length} failed PendingPayment record(s) — admin should review:`);
      failed.forEach((p, i) => {
        console.log(`  [${i+1}] PendingPayment ID: ${p._id}  rzpOrderId=${p.razorpayOrderId}  error="${p.error}"`);
      });
    }
  } else {
    warn(`GET /v1/orders/pending-payments → ${ppRes.status}  body=${JSON.stringify(ppRes.body).slice(0,200)}`);
  }
}

// ─── STEP 5 — Summary ─────────────────────────────────────
function printSummary() {
  head("TEST RUN COMPLETE");
  console.log(`
  How to use these results
  ─────────────────────────────────────────────
  • Address test (STEP 2):
    – If you saw ✅ for add/get/set-default and checkout, the address path is working.
    – If checkout with empty address was blocked with 400, the server-side validation is active.

  • Stock race (STEP 3):
    – Set a product to stock=1 in the Admin dashboard BEFORE running if you want a true race test.
    – Then re-run:  node scripts/test-api.js
    – Expected: one 201, one 409 "sold out".

  • Refund-required (STEP 4):
    – Any order printed here needs a MANUAL refund in Razorpay:
      Razorpay Dashboard → Payments → find razorpayPaymentId → click Refund
    – After refunding, update the order status to "cancel" or "refunded" in your DB.

  • To run with OTP auth:
      TEST_PHONE=9XXXXXXXXX TEST_OTP=<sms_code> node scripts/test-api.js

  • To run against production:
      TEST_BASE_URL=https://your-backend.vercel.app node scripts/test-api.js

  • To include admin checks (refund_required + pending-payments):
      ADMIN_TOKEN=<your_admin_jwt> node scripts/test-api.js
  `);
}

// ─── PAYLOAD BUILDER ────────────────────────────────────────
// Resolve multilingual title (may be {en: "..."}  or plain string)
function resolveTitle(title) {
  if (!title) return "Unknown Product";
  if (typeof title === "string") return title;
  return title.en || title.ar || Object.values(title)[0] || "Unknown Product";
}

function buildOrderPayload(product, addr) {
  const price = product.prices?.price || product.price || 100;
  return {
    cart: [{
      _id          : product._id,
      title        : resolveTitle(product.title),
      quantity     : 1,
      price        : price,
      originalPrice: price,
      taxPercent   : product.taxPercent || 0,
      taxableRate  : product.taxableRate || null,
    }],
    user_info: {
      name   : addr.name,
      email  : addr.email || "test@horeca1.com",
      contact: addr.contact || "9000000000",
      address: addr.address,
      city   : addr.city,
      country: addr.country || "India",
      zipCode: addr.zipCode,
    },
    subTotal     : price,
    shippingCost : 0,
    total        : price,
    paymentMethod: "COD",
    shippingOption: "defaultShipping",
  };
}

// ─── MAIN ───────────────────────────────────────────────────
(async () => {
  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════╗`);
  console.log(`║  Horeca1 Backend — API Test Suite            ║`);
  console.log(`║  Base URL: ${BASE.padEnd(34)}║`);
  console.log(`╚══════════════════════════════════════════════╝${colors.reset}\n`);

  try {
    await healthCheck();
    await loginViaOTP();
    await testAddressFlow();
    await testStockRace();
    await testAdminRefundRequired();
    printSummary();
  } catch (err) {
    fail(`Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
})();
