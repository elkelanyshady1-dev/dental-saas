/**
 * invoicePdf.service.js
 * Platform Finance — Professional Invoice PDF Generator (v2.0)
 *
 * Renders a fully branded, multi-section invoice PDF using pdfkit.
 *
 * Layout sections:
 *   ① Header band         — brand color bar with company name + logo
 *   ② Invoice meta strip  — invoice #, date, due date (two-column)
 *   ③ Bill-to block       — organization name, country
 *   ④ Line items table    — description / qty / unit price / total
 *   ⑤ Totals block        — subtotal, coupons, credit, tax, grand total
 *   ⑥ Status stamp        — diagonal watermark (PAID / OPEN / VOID …)
 *   ⑦ Footer band         — branding + support email
 *
 * Branding is read from src/config/platformBranding.js (env-overridable).
 *
 * PLANE: Platform
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const logger = require("@utils/logger");
const branding = require("@config/platformBranding");

// ─── Page geometry ────────────────────────────────────────────────────────────
const MARGIN = 50;
const PAGE_WIDTH = 595.28;                   // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;  // 495.28 pt

// ─── Column layout for line items table ──────────────────────────────────────
// Positions are absolute x coordinates within the content area
const COL = {
    desc: MARGIN,           // Description (widest)
    qty: MARGIN + 290,     // Qty
    unitPrice: MARGIN + 340,     // Unit Price
    total: MARGIN + 430,     // Total (right-aligned)
};

// ─── Colour palette (reads from branding config, falls back to defaults) ──────
const COLORS = {
    brand: branding.primaryColor || "#1e40af",
    brandLight: branding.primaryColorLight || "#eff6ff",
    brandDark: "#172554",    // indigo-950 — accent for dividers
    white: "#ffffff",
    border: "#e2e8f0",   // slate-200
    text: "#1e293b",   // slate-800
    muted: "#64748b",   // slate-500
    mutedLight: "#94a3b8",   // slate-400
    success: "#16a34a",   // green-600  — PAID watermark
    danger: "#dc2626",   // red-600    — VOID / UNCOLLECTIBLE
    amber: "#d97706",   // amber-600  — OPEN / DRAFT
    rowAlt: "#f8fafc",   // slate-50   — alternating row tint
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMoney(amount, currency) {
    if (amount == null) return "0.00";
    const sym = CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : "");
    return `${sym}${Number(amount).toFixed(2)}`;
}

const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", EGP: "EGP ", SAR: "SAR ", AED: "AED " };

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateShort(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function statusWatermarkColor(status) {
    switch ((status || "").toLowerCase()) {
        case "paid": return COLORS.success;
        case "void":
        case "uncollectible": return COLORS.danger;
        default: return COLORS.amber;
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateInvoicePdf
 *
 * @param {object} invoice      PlatformInvoice lean document
 * @param {object} organization Organization lean document (name, billingCountry, regionCode)
 * @returns {Promise<Buffer>}   Completed PDF binary
 */
async function generateInvoicePdf(invoice, organization) {
    return new Promise((resolve, reject) => {
        try {
            const chunks = [];
            const doc = new PDFDocument({
                size: "A4",
                margin: MARGIN,
                info: {
                    Title: `Invoice ${invoice.invoiceNumber || invoice._id}`,
                    Author: branding.companyName,
                    Subject: "Platform Invoice",
                    Creator: `${branding.companyName} Billing System`,
                    Producer: "pdfkit"
                }
            });

            doc.on("data", (c) => chunks.push(c));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            _renderPage(doc, invoice, organization);
            doc.end();

        } catch (err) {
            logger.error({ err, invoiceId: invoice?._id }, "[invoicePdf] generation failed");
            reject(err);
        }
    });
}

// ─── Page renderer ────────────────────────────────────────────────────────────

function _renderPage(doc, invoice, organization) {
    _drawHeaderBand(doc, invoice);
    _drawStatusWatermark(doc, invoice);
    _drawMetaSection(doc, invoice, organization);
    _drawDivider(doc, doc.y + 4);
    _drawLineItemsTable(doc, invoice);
    _drawTotalsBlock(doc, invoice);
    _drawFooter(doc, invoice);
}

// ① Header band ────────────────────────────────────────────────────────────────

function _drawHeaderBand(doc, invoice) {
    const bandH = 90;

    // Solid brand-color background
    doc.rect(0, 0, PAGE_WIDTH, bandH).fill(COLORS.brand);

    // Subtle diagonal stripes for texture
    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, bandH).clip();
    doc.strokeColor(COLORS.brandDark).lineWidth(0.5).opacity(0.25);
    for (let x = -50; x < PAGE_WIDTH + 50; x += 18) {
        doc.moveTo(x, 0).lineTo(x + bandH, bandH).stroke();
    }
    doc.restore();
    doc.opacity(1);

    // Try to render logo — silent fallback if file missing
    const logoX = MARGIN;
    let textX = MARGIN;
    try {
        if (branding.logoPath && fs.existsSync(branding.logoPath)) {
            doc.image(branding.logoPath, logoX, 12, { height: 40, fit: [80, 40] });
            textX = logoX + 90;
        }
    } catch (_) { /* logo is optional */ }

    // Company name + tagline (left side)
    doc.fillColor(COLORS.white)
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(branding.companyName, textX, 18, { lineBreak: false });

    doc.fillColor("rgba(255,255,255,0.7)")
        .fontSize(9)
        .font("Helvetica")
        .text(branding.tagline, textX, 43, { lineBreak: false });

    doc.fillColor("rgba(255,255,255,0.55)")
        .fontSize(8)
        .text(branding.address, textX, 58, { lineBreak: false });

    // "INVOICE" label (right side)
    doc.fillColor(COLORS.white)
        .fontSize(28)
        .font("Helvetica-Bold")
        .text("INVOICE", 0, 22, { align: "right", width: PAGE_WIDTH - MARGIN });

    doc.fillColor("rgba(255,255,255,0.65)")
        .fontSize(9)
        .font("Helvetica")
        .text(`#${invoice.invoiceNumber || "DRAFT"}`, 0, 56, { align: "right", width: PAGE_WIDTH - MARGIN });

    // Move cursor below band
    doc.y = bandH + 12;
}

// ⑥ Status watermark (diagonal, low-opacity) ──────────────────────────────────

function _drawStatusWatermark(doc, invoice) {
    const label = (invoice.status || "open").toUpperCase();
    const color = statusWatermarkColor(invoice.status);
    const cx = PAGE_WIDTH / 2;
    const cy = 420;        // vertical centre of printable area

    doc.save();
    doc.rotate(-35, { origin: [cx, cy] });
    doc.fillOpacity(0.055)
        .fillColor(color)
        .fontSize(95)
        .font("Helvetica-Bold")
        .text(label, 0, cy - 48, { align: "center", width: PAGE_WIDTH, lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
}

// ② Meta section (two-column: Bill To | Invoice Details) ──────────────────────

function _drawMetaSection(doc, invoice, organization) {
    const topY = doc.y;

    // ── Left: Bill To ──────────────────────────────────────────────────────────
    _label(doc, "BILL TO", MARGIN, topY);

    const orgName = organization?.name || "—";
    const orgCountry = organization?.billingCountry || "";      // ISO code only (Sentinel §4)

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.text)
        .text(orgName, MARGIN, topY + 14);

    if (orgCountry) {
        doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted)
            .text(`Country: ${orgCountry}`, MARGIN, topY + 30);
    }

    const contractDisplay = invoice.contractId
        ? (typeof invoice.contractId === "object"
            ? String(invoice.contractId._id ?? invoice.contractId).slice(-10)
            : String(invoice.contractId).slice(-10))
        : "—";

    doc.font("Helvetica").fontSize(8).fillColor(COLORS.mutedLight)
        .text(`Contract ref: ${contractDisplay}`, MARGIN, topY + 44);

    // ── Right: Invoice metadata table ─────────────────────────────────────────
    const rightX = MARGIN + CONTENT_WIDTH * 0.52;
    const metaRows = [
        ["Invoice #", invoice.invoiceNumber || "DRAFT"],
        ["Issue Date", fmtDate(invoice.createdAt)],
        ["Due Date", fmtDate(invoice.dueDate)],
        ["Billing Period", `${fmtDateShort(invoice.billingCycleStart)} – ${fmtDateShort(invoice.billingCycleEnd)}`],
        ["Currency", invoice.currency || "USD"],
        ["Status", (invoice.status || "open").toUpperCase()],
    ];

    let metaY = topY;
    for (const [k, v] of metaRows) {
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
            .text(k, rightX, metaY, { continued: false });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text)
            .text(v, rightX + 100, metaY, { lineBreak: false });
        metaY += 13;
    }

    doc.y = Math.max(doc.y, metaY + 4, topY + 65);
}

// ④ Line items table ───────────────────────────────────────────────────────────

function _drawLineItemsTable(doc, invoice) {
    doc.moveDown(0.5);
    const tableStartY = doc.y;

    _drawTableHeader(doc, tableStartY);

    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    let rowY = tableStartY + 22;

    lineItems.forEach((item, idx) => {
        // Alternating row tint
        if (idx % 2 === 1) {
            doc.rect(MARGIN, rowY - 2, CONTENT_WIDTH, 18).fill(COLORS.rowAlt);
        }
        _drawTableRow(doc, item, rowY, invoice.currency);
        rowY += 18;
    });

    if (lineItems.length === 0) {
        doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted)
            .text("No line items", MARGIN, rowY + 4);
        rowY += 18;
    }

    doc.y = rowY + 6;
    _drawDivider(doc, doc.y);
    doc.y += 8;
}

function _drawTableHeader(doc, y) {
    // Header band
    doc.rect(MARGIN, y, CONTENT_WIDTH, 22).fill(COLORS.brand);

    doc.fillColor(COLORS.white).fontSize(8).font("Helvetica-Bold");
    doc.text("DESCRIPTION", COL.desc + 2, y + 7);
    doc.text("QTY", COL.qty, y + 7);
    doc.text("UNIT PRICE", COL.unitPrice, y + 7);
    doc.text("TOTAL", COL.total + 2, y + 7, { width: 60, align: "right" });
}

function _drawTableRow(doc, item, y, currency) {
    doc.fillColor(COLORS.text).fontSize(8.5).font("Helvetica");

    // Description — allow wrap up to qty column
    const descWidth = COL.qty - COL.desc - 8;
    doc.text(item.description || "", COL.desc + 2, y, { width: descWidth, lineBreak: false });

    doc.text(String(item.quantity ?? 1), COL.qty, y, { lineBreak: false });
    doc.text(fmtMoney(item.unitPrice, currency), COL.unitPrice, y, { lineBreak: false });

    // Negative items (discounts) in muted colour
    const isNegative = Number(item.total) < 0;
    doc.fillColor(isNegative ? COLORS.muted : COLORS.text)
        .text(fmtMoney(item.total, currency), COL.total + 2, y, { width: 60, align: "right", lineBreak: false });
}

// ⑤ Totals block ──────────────────────────────────────────────────────────────

function _drawTotalsBlock(doc, invoice) {
    const currency = invoice.currency;
    const blockX = MARGIN + CONTENT_WIDTH * 0.52;
    const blockW = CONTENT_WIDTH - (blockX - MARGIN);

    const rows = [
        { label: "Subtotal", value: fmtMoney(invoice.subtotalAmount, currency) },
        invoice.couponDiscountAmount > 0
            ? { label: `Coupon (${invoice.couponCode || "—"})`, value: `- ${fmtMoney(invoice.couponDiscountAmount, currency)}`, muted: true }
            : null,
        invoice.creditApplied > 0
            ? { label: "Credit Applied", value: `- ${fmtMoney(invoice.creditApplied, currency)}`, muted: true }
            : null,
        invoice.taxAmount > 0
            ? { label: `Tax (${invoice.taxPercent || 0}%)`, value: fmtMoney(invoice.taxAmount, currency) }
            : null,
    ].filter(Boolean);

    let rowY = doc.y;

    for (const row of rows) {
        doc.fontSize(9)
            .font("Helvetica")
            .fillColor(row.muted ? COLORS.muted : COLORS.text)
            .text(row.label, blockX, rowY)
            .text(row.value, blockX, rowY, { align: "right", width: blockW });
        rowY += 14;
    }

    // Grand total — highlighted box
    rowY += 4;
    const totalBoxH = 28;
    doc.rect(blockX - 4, rowY - 4, blockW + 4, totalBoxH).fill(COLORS.brand);

    doc.fillColor(COLORS.white)
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("TOTAL DUE", blockX + 2, rowY + 6)
        .text(fmtMoney(invoice.totalAmount, currency), blockX + 2, rowY + 6, {
            align: "right",
            width: blockW - 4
        });

    doc.y = rowY + totalBoxH + 12;

    // Payment status pill
    const paidAt = invoice.paidAt;
    const statusText = invoice.status === "paid"
        ? `✓ PAID  ${paidAt ? `on ${fmtDate(paidAt)}` : ""}`
        : `Payment status: ${(invoice.paymentStatus || invoice.status || "pending").toUpperCase()}`;

    const pillColor = invoice.status === "paid" ? COLORS.success
        : invoice.status === "void" ? COLORS.danger
            : COLORS.amber;

    doc.rect(blockX - 4, doc.y, blockW + 4, 18).fill(pillColor + "22"); // 13% opacity
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(pillColor)
        .text(statusText, blockX + 2, doc.y + 4, { width: blockW, align: "center" });

    doc.y += 24;
}

// ⑦ Footer band ───────────────────────────────────────────────────────────────

function _drawFooter(doc, invoice) {
    const footerH = 48;
    const footerY = doc.page.height - footerH - 10;

    // Light brand tint background
    doc.rect(0, footerY, PAGE_WIDTH, footerH).fill(COLORS.brandLight);

    // Thin brand-color top border
    doc.rect(0, footerY, PAGE_WIDTH, 2).fill(COLORS.brand);

    // Left: Generated by
    doc.fillColor(COLORS.muted).fontSize(7.5).font("Helvetica")
        .text(
            `Generated by ${branding.companyName} Billing System  •  ${new Date().toUTCString()}`,
            MARGIN, footerY + 10,
            { width: CONTENT_WIDTH, align: "left", lineBreak: false }
        );

    // Center: Support contact
    doc.fillColor(COLORS.muted).fontSize(7.5).font("Helvetica")
        .text(
            `Billing queries: ${branding.supportEmail}`,
            MARGIN, footerY + 24,
            { width: CONTENT_WIDTH, align: "left", lineBreak: false }
        );

    // Right: Page number placeholder
    doc.fillColor(COLORS.mutedLight).fontSize(7.5).font("Helvetica")
        .text(
            `Invoice ${invoice.invoiceNumber || invoice._id}`,
            0, footerY + 10,
            { width: PAGE_WIDTH - MARGIN, align: "right", lineBreak: false }
        );
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _label(doc, text, x, y) {
    doc.font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(COLORS.muted)
        .text(text, x, y, { characterSpacing: 1 });
}

function _drawDivider(doc, y) {
    doc.moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .strokeColor(COLORS.border)
        .lineWidth(0.75)
        .stroke();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateInvoicePdf };
