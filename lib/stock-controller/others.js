require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../../models/Product");

// const base = 'https://api-m.sandbox.paypal.com';

// decrease product quantity after an order is created.
// Atomic + conditional: each update only matches if the product still has
// enough stock. This closes the read-check-write race that previously let
// oversold orders through. Returns a result object so the caller can roll
// back the order if any decrement failed to match.
const handleProductQuantity = async (cart) => {
  try {
    if (!cart || cart.length === 0) {
      return { success: true, matched: 0, expected: 0, failedItems: [] };
    }

    const bulkOps = cart.map((p) => {
      const qty = Number(p.quantity) || 0;
      if (p?.isCombination) {
        return {
          updateOne: {
            filter: {
              _id: p._id,
              "variants.productId": p?.variant?.productId || "",
              "variants.quantity": { $gte: qty },
              stock: { $gte: qty },
            },
            update: {
              $inc: {
                stock: -qty,
                "variants.$.quantity": -qty,
                sales: qty,
              },
            },
          },
        };
      }
      return {
        updateOne: {
          filter: {
            _id: p._id,
            stock: { $gte: qty }, // atomic stock guard
          },
          update: {
            $inc: {
              stock: -qty,
              sales: qty,
            },
          },
        },
      };
    });

    const result = await Product.bulkWrite(bulkOps);
    const matched = result?.matchedCount ?? result?.result?.nMatched ?? 0;
    const expected = bulkOps.length;

    if (matched < expected) {
      // Figure out which items didn't decrement so the caller can report them.
      // We query by id and check if stock went below the requested qty — by
      // the time we read, another transaction may have adjusted things, so
      // this is best-effort diagnostics, not a strict guarantee.
      const ids = cart.map((p) => p._id);
      const dbProducts = await Product.find({ _id: { $in: ids } })
        .select("_id title stock")
        .lean();
      const byId = dbProducts.reduce((acc, p) => {
        acc[p._id.toString()] = p;
        return acc;
      }, {});
      const failedItems = cart
        .filter((c) => {
          const p = byId[(c._id || "").toString()];
          return !p || p.stock < 0 || p.stock < Number(c.quantity);
        })
        .map((c) => ({
          _id: c._id,
          title: c.title,
          requested: Number(c.quantity) || 0,
          available: byId[(c._id || "").toString()]?.stock ?? null,
        }));

      console.warn(
        `[Stock] Partial decrement: matched=${matched}/${expected}. Failed items:`,
        failedItems
      );
      return { success: false, matched, expected, failedItems };
    }

    console.log(`[Stock] Successfully decremented ${matched} products`);
    return { success: true, matched, expected, failedItems: [] };
  } catch (err) {
    console.log("err on handleProductQuantity", err.message);
    return { success: false, matched: 0, expected: (cart || []).length, error: err.message, failedItems: [] };
  }
};

const handleProductAttribute = async (key, value, multi) => {
  try {
    // const products = await Product.find({ 'variants.1': { $exists: true } });
    const products = await Product.find({ isCombination: true });

    // console.log('products', products);

    if (multi) {
      for (const p of products) {
        await Product.updateOne(
          { _id: p._id },
          {
            $pull: {
              variants: { [key]: { $in: value } },
            },
          }
        );
      }
    } else {
      for (const p of products) {
        // console.log('p', p._id);
        await Product.updateOne(
          { _id: p._id },
          {
            $pull: {
              variants: { [key]: value },
            },
          }
        );
      }
    }
  } catch (err) {
    console.log("err, when delete product variants", err.message);
  }
};

module.exports = {
  handleProductQuantity,
  handleProductAttribute,
};
