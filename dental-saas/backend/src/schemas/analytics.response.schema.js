/**
 * analytics.response.schema.js
 * Analytics Domain — Zod response schemas (HR-4 contract enforcement)
 *
 * Every analytics controller routes its DTO through one of these schemas
 * via contractEnforcer.enforce(). Any drift between backend DTO and
 * frontend expectation is flagged in logs (prod) or stderr (dev).
 */

"use strict";

const { z } = require("zod");

const metaSchema = z.object({
    from: z.string(),
    to: z.string(),
    granularity: z.enum(["day", "week", "month"]),
    timezone: z.string(),
    branchId: z.string().nullable(),
    currency: z.string(),
    generatedAt: z.string(),
});

const kpiCardSchema = z.object({
    key: z.string(),
    label: z.string(),
    value: z.number(),
    previousValue: z.number(),
    delta: z.number(), // absolute delta
    deltaPct: z.number(), // percentage delta (may be negative)
    unit: z.enum(["currency", "count", "percent", "duration"]),
    sparkline: z.array(z.number()).default([]),
});

const overviewSchema = z.object({
    meta: metaSchema,
    cards: z.array(kpiCardSchema),
});

const revenuePointSchema = z.object({
    bucket: z.string(),
    paid: z.number(),
    invoiced: z.number(),
    outstanding: z.number(),
});

const revenueSchema = z.object({
    meta: metaSchema,
    series: z.array(revenuePointSchema),
    totals: z.object({
        paid: z.number(),
        invoiced: z.number(),
        outstanding: z.number(),
        invoiceCount: z.number(),
        paymentCount: z.number(),
    }),
});

const appointmentsSchema = z.object({
    meta: metaSchema,
    funnel: z.array(
        z.object({
            status: z.string(),
            count: z.number(),
            pct: z.number(),
        }),
    ),
    rates: z.object({
        completionRate: z.number(),
        noShowRate: z.number(),
        cancellationRate: z.number(),
    }),
    totals: z.object({
        total: z.number(),
        completed: z.number(),
        cancelled: z.number(),
        noShow: z.number(),
    }),
});

const patientsSchema = z.object({
    meta: metaSchema,
    series: z.array(
        z.object({
            bucket: z.string(),
            newPatients: z.number(),
            cumulative: z.number(),
        }),
    ),
    totals: z.object({
        newPatients: z.number(),
        privatePatients: z.number(),
        academicPatients: z.number(),
    }),
});

const proceduresSchema = z.object({
    meta: metaSchema,
    slices: z.array(
        z.object({
            category: z.string(),
            count: z.number(),
            revenue: z.number(),
            pct: z.number(),
        }),
    ),
    totals: z.object({
        count: z.number(),
        revenue: z.number(),
    }),
});

const doctorsSchema = z.object({
    meta: metaSchema,
    rows: z.array(
        z.object({
            doctorId: z.string(),
            displayName: z.string(),
            appointments: z.number(),
            completed: z.number(),
            completionRate: z.number(),
            revenue: z.number(),
        }),
    ),
});

const chairSchema = z.object({
    meta: metaSchema,
    rows: z.array(
        z.object({
            branchId: z.string(),
            branchName: z.string(),
            chairId: z.string(),
            chairName: z.string(),
            bookedMinutes: z.number(),
            availableMinutes: z.number(),
            utilization: z.number(),
        }),
    ),
    totals: z.object({
        bookedMinutes: z.number(),
        availableMinutes: z.number(),
        utilization: z.number(),
    }),
});

const branchesSchema = z.object({
    meta: metaSchema,
    rows: z.array(
        z.object({
            branchId: z.string(),
            branchName: z.string(),
            revenue: z.number(),
            appointments: z.number(),
            newPatients: z.number(),
            completionRate: z.number(),
        }),
    ),
});

const labSchema = z.object({
    meta: metaSchema,
    series: z.array(
        z.object({
            bucket: z.string(),
            onTime: z.number(),
            late: z.number(),
            pending: z.number(),
        }),
    ),
    totals: z.object({
        cases: z.number(),
        onTime: z.number(),
        late: z.number(),
        pending: z.number(),
        onTimePct: z.number(),
    }),
});

const inventorySchema = z.object({
    meta: metaSchema,
    alerts: z.array(
        z.object({
            itemId: z.string(),
            name: z.string(),
            stockLevel: z.number(),
            minStockLevel: z.number(),
            deficit: z.number(),
        }),
    ),
    burn: z.array(
        z.object({
            itemId: z.string(),
            name: z.string(),
            totalBurn: z.number(),
        }),
    ),
    totals: z.object({
        alertCount: z.number(),
        burnItemCount: z.number(),
    }),
});

module.exports = {
    metaSchema,
    overviewSchema,
    revenueSchema,
    appointmentsSchema,
    patientsSchema,
    proceduresSchema,
    doctorsSchema,
    chairSchema,
    branchesSchema,
    labSchema,
    inventorySchema,
};
