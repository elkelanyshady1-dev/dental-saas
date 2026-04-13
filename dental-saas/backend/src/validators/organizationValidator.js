/**
 * organizationValidator.js
 * v20.1 Wave4 — Provisioning Contract Validation
 *
 * Validates ONLY the minimal HTTP inputs required to provision an org.
 * Commercial fields (planId, billingCountry, billingCurrency, regionCode)
 * are derived inside provisionOrganization() — NOT validated here.
 */

const { z } = require("zod");

const ALLOWED_COUNTRIES = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "GB", "US"];

exports.provisionOrgSchema = z.object({
    organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
    slug: z.string().optional(),
    adminEmail: z.string().email("Invalid admin email"),
    country: z
        .string()
        .length(2, "Country must be 2-letter ISO code")
        .transform((v) => v.toUpperCase())
        .refine((v) => ALLOWED_COUNTRIES.includes(v), {
            message: `Country must be one of: ${ALLOWED_COUNTRIES.join(", ")}`
        }),
    status: z.enum(["trial", "active", "suspended"]).optional(),
    trialDays: z.number().int().positive().optional(),
});
