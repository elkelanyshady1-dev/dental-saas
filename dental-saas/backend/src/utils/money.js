// backend/src/core/finance/Money.js

/**
 * Enterprise-grade immutable Money value object.
 * Stores monetary value in minor units (integer).
 * Fully currency-aware and rounding-safe.
 */

const ROUNDING = {
    HALF_UP: "HALF_UP",
    FLOOR: "FLOOR",
    CEIL: "CEIL"
};

const CURRENCY_PRECISION = {
    USD: 2,
    EUR: 2,
    AED: 2,
    SAR: 2,
    EGP: 2,
    JPY: 0,
    KWD: 3
};

class Money {

    constructor({ amountMinor, currency }) {
        if (!currency) {
            throw new Error("Currency is required");
        }

        if (!Number.isInteger(amountMinor)) {
            throw new Error("amountMinor must be an integer");
        }

        if (!Number.isSafeInteger(amountMinor)) {
            throw new Error("amountMinor exceeds safe integer range");
        }

        this._amountMinor = amountMinor;
        this._currency = currency;

        Object.freeze(this);
    }

    // ---------- Static Constructors ----------

    static fromDecimal(amountDecimal, currency) {
        const precision = Money._getPrecision(currency);
        const multiplier = 10 ** precision;

        const minor = Math.round(Number(amountDecimal) * multiplier);

        return new Money({
            amountMinor: minor,
            currency
        });
    }

    static fromMinor(amountMinor, currency) {
        return new Money({ amountMinor, currency });
    }

    // ---------- Core Accessors ----------

    get currency() {
        return this._currency;
    }

    get amountMinor() {
        return this._amountMinor;
    }

    toDecimal() {
        const precision = Money._getPrecision(this._currency);
        return this._amountMinor / (10 ** precision);
    }

    // ---------- Arithmetic (Immutable) ----------

    add(other) {
        Money._assertSameCurrency(this, other);
        const result = this._amountMinor + other._amountMinor;
        this._assertSafe(result);

        return new Money({
            amountMinor: result,
            currency: this._currency
        });
    }

    subtract(other) {
        Money._assertSameCurrency(this, other);
        const result = this._amountMinor - other._amountMinor;
        this._assertSafe(result);

        return new Money({
            amountMinor: result,
            currency: this._currency
        });
    }

    multiply(quantity) {
        if (!Number.isInteger(quantity)) {
            throw new Error("Quantity must be integer");
        }
        const result = this._amountMinor * quantity;
        this._assertSafe(result);

        return new Money({
            amountMinor: result,
            currency: this._currency
        });
    }

    /**
     * Apply percentage safely using integer math.
     * percent = 14 means 14%
     */
    applyPercentage(percent, roundingMode = ROUNDING.HALF_UP) {
        if (!Number.isInteger(percent)) {
            throw new Error("Percent must be integer");
        }

        const raw = this._amountMinor * percent;
        const divided = Money._divide(raw, 100, roundingMode);
        this._assertSafe(divided);

        return new Money({
            amountMinor: divided,
            currency: this._currency
        });
    }

    /**
     * Proration calculation:
     * (remainingDays / totalDays) * amount
     */
    prorate(remainingDays, totalDays, roundingMode = ROUNDING.HALF_UP) {
        if (!Number.isInteger(remainingDays) || !Number.isInteger(totalDays)) {
            throw new Error("Proration inputs must be integers");
        }

        const raw = this._amountMinor * remainingDays;
        const divided = Money._divide(raw, totalDays, roundingMode);
        this._assertSafe(divided);

        return new Money({
            amountMinor: divided,
            currency: this._currency
        });
    }

    /**
     * Invariant: Safe Integer Protection
     */
    _assertSafe(value) {
        if (!Number.isSafeInteger(value)) {
            throw new Error("Enterprise Invariant Violation: Unsafe integer overflow detected");
        }
    }

    // ---------- Internal Utilities ----------

    static _divide(value, divisor, roundingMode) {
        const result = value / divisor;

        switch (roundingMode) {
            case ROUNDING.FLOOR:
                return Math.floor(result);
            case ROUNDING.CEIL:
                return Math.ceil(result);
            case ROUNDING.HALF_UP:
            default:
                return Math.round(result);
        }
    }

    static _getPrecision(currency) {
        const precision = CURRENCY_PRECISION[currency];

        if (precision === undefined) {
            throw new Error(`Unsupported currency: ${currency}`);
        }

        return precision;
    }

    static _assertSameCurrency(a, b) {
        if (a._currency !== b._currency) {
            throw new Error("Currency mismatch");
        }
    }

}

module.exports = {
    Money,
    ROUNDING,

    // ── Section 3: Functional helpers (no instantiation required) ─────────────
    // Use these for inline rounding in services without creating a Money object.

    /**
     * toMinorUnits — convert decimal amount to integer minor units
     * e.g. 3647.09 → 364709
     * Uses Math.round to eliminate floating-point artifacts.
     */
    toMinorUnits(amount, currency = "EGP") {
        const precision = CURRENCY_PRECISION[currency] ?? 2;
        return Math.round(Number(amount ?? 0) * (10 ** precision));
    },

    /**
     * fromMinorUnits — convert integer minor units back to decimal
     * e.g. 364709 → 3647.09
     */
    fromMinorUnits(amountMinor, currency = "EGP") {
        const precision = CURRENCY_PRECISION[currency] ?? 2;
        return (amountMinor ?? 0) / (10 ** precision);
    },

    /**
     * roundCurrency — safe 2dp rounding using Number.EPSILON trick
     * Eliminates JS floating-point artifacts like 3647.0899999999997.
     * e.g. roundCurrency(3647.0899999999997) → 3647.09
     */
    roundCurrency(value) {
        return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
    },

    /**
     * assertPrecision — Section 10 invariant
     * Throws if a monetary value has more than 2 decimal places.
     * Guards input payment amounts before they enter the engine.
     *
     * @param {number} value
     * @param {string} [fieldName]
     * @throws {Error} INVOICE_AMOUNT_PRECISION
     */
    assertPrecision(value, fieldName = "amount") {
        const rounded = Math.round(Number(value) * 100) / 100;
        if (Math.abs(rounded - Number(value)) > Number.EPSILON * 100) {
            const err = new Error(
                `INVOICE_AMOUNT_PRECISION: ${fieldName} has more than 2 decimal places (${value}). ` +
                `Round to 2dp before submitting.`
            );
            err.code = "INVOICE_AMOUNT_PRECISION";
            err.statusCode = 422;
            throw err;
        }
    }
};