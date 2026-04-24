/**
 * InvoiceSequence.model.js
 * Platform Billing — Atomic Invoice Number Sequence Counter
 *
 * PURPOSE:
 * Provides a race-safe, atomic monotonic counter for invoice number generation.
 *
 * WHY NOT countDocuments?
 * countDocuments has a TOCTOU (time-of-check / time-of-use) race:
 *   T1 reads count = 5  →  T2 reads count = 5
 *   T1 writes INV-202503-00006
 *   T2 writes INV-202503-00006  ← DUPLICATE invoice number
 *
 * WHY findOneAndUpdate($inc)?
 * MongoDB's findOneAndUpdate($inc) is atomic at the document level.
 * Two concurrent callers ALWAYS receive different seq values — guaranteed by
 * the server-side compare-and-swap behavior of $inc.
 *
 * SCHEMA:
 *   { yearMonth: "202503", seq: 42 }
 *
 * USAGE (via invoiceEngine.service.js):
 *   const seq = await InvoiceSequence.findOneAndUpdate(
 *       { yearMonth },
 *       { $inc: { seq: 1 } },
 *       { upsert: true, new: true }
 *   );
 *   const invoiceNumber = `INV-${yearMonth}-${String(seq.seq).padStart(5, "0")}`;
 *
 * PLANE: Platform
 * COLLECTION: invoicesequences
 */

"use strict";

const mongoose = require("mongoose");
const invoiceSequenceSchema = new mongoose.Schema({
  // ── Partition key: one document per billing month ─────────────────────
  // Format: "YYYYMM" (e.g. "202503" for March 2025)
  yearMonth: {
    type: String,
    required: true,
    match: /^\d{6}$/ // Validation: exactly 6 digits
    // Unique constraint is declared via invoiceSequenceSchema.index() below —
    // declaring it here too would create a Mongoose duplicate index warning.
  },
  // ── Monotonic counter ─────────────────────────────────────────────────
  // Atomically incremented via $inc. Starts at 0 (first invoice = 1).
  seq: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  collection: "invoicesequences"
});

// ─── Index: unique constraint on yearMonth ────────────────────────────────────
// Explicit index declaration ensures the collection+index is registered in
// mongoose.connection.collections for transaction bootstrap (bootstrapCollections.js).
// unique:true on the field definition above creates the same index — Mongoose
// is smart enough not to create duplicates when unique:true is present on the field.
invoiceSequenceSchema.index({
  yearMonth: 1
}, {
  unique: true
});
const modelName = "InvoiceSequence";
module.exports = {
  modelName,
  schema: invoiceSequenceSchema
};