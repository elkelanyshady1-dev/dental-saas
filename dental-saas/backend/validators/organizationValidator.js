const { z } = require("zod");

exports.provisionOrgSchema = z.object({
    organizationName: z.string().min(2, "Name must be at least 2 characters"),
    slug: z.string().optional(),
    plan: z.string().optional(),
    status: z.string().optional(),
    adminEmail: z.string().email("Invalid admin email address"),
    trialDays: z.number().or(z.string()).optional(),
    country: z.enum([
        "Egypt",
        "Saudi Arabia",
        "UAE",
        "Kuwait",
        "Qatar",
        "Bahrain",
        "Oman",
        "UK",
        "USA"
    ], { errorMap: () => ({ message: "Please select a valid country" }) })
});
