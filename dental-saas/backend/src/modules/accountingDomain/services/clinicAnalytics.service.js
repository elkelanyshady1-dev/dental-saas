/**
 * clinicAnalytics.service.js
 * AccountingDomain — Live Analytics Service (MIGRATED from billingDomain)
 *
 * SOURCE: Migrated from billingDomain/analytics/services/billingSummary.service.js
 * REASON: billingDomain is WRITE only. Analytics belongs to accountingDomain.
 *
 * CLASSIFICATION: READ MODEL — zero writes to billing tables.
 * SCOPE: Org-specific (per-org isolated DB via req.dbConnection)
 *
 * DATA ACCESS:
 *   Queries PatientInvoice / PatientPayment via getModel(req.dbConnection, Def).
 *   This is a LIVE query approach (no projection lag).
 *   Future: can be shifted fully to projection-based reads.
 *
 * PERMISSION: P.ACCOUNTING_READ
 * PLANE: Org only
 *
 * ⚠️  DOMAIN RULE: This service is in accountingDomain.
 *   billingDomain/analytics/ routes now delegate HERE.
 *   Do NOT re-add analytics logic to billingDomain services.
 *
 * @module accountingDomain/services/clinicAnalytics.service
 */

"use strict";

const mongoose = require("mongoose");
const getModel = require("@core/db/getModel");
const PatientInvoiceDef = require("@modules/billingDomain/organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("@modules/billingDomain/organizationFinance/models/PatientPayment.model");

// ─── Connection-Aware Model Resolvers ─────────────────────────────────────────

function _getInvoice(req) {
  return getModel(req.dbConnection, PatientInvoiceDef);
}
function _getPayment(req) {
  return getModel(req.dbConnection, PatientPaymentDef);
}

// ─── Service Class ────────────────────────────────────────────────────────────

class ClinicAnalyticsService {
  /**
   * getDailySummary
   * Revenue and outstanding totals for a specific date.
   */
  async getDailySummary({
    req,
    date,
    branchId
  }) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const matchBase = {
      createdAt: {
        $gte: dayStart,
        $lte: dayEnd
      }
    };
    if (branchId) matchBase.branchId = new mongoose.Types.ObjectId(branchId);
    const [invoiceSummary, paymentSummary] = await Promise.all([_getInvoice(req).aggregate([{
      $match: {
        ...matchBase,
        status: {
          $in: ["issued", "partially_paid", "paid"]
        }
      }
    }, {
      $group: {
        _id: null,
        totalBilled: {
          $sum: "$totalAmount"
        },
        totalPaid: {
          $sum: {
            $cond: [{
              $eq: ["$status", "paid"]
            }, "$totalAmount", 0]
          }
        },
        invoiceCount: {
          $sum: 1
        },
        paidCount: {
          $sum: {
            $cond: [{
              $eq: ["$status", "paid"]
            }, 1, 0]
          }
        },
        partialCount: {
          $sum: {
            $cond: [{
              $eq: ["$status", "partially_paid"]
            }, 1, 0]
          }
        }
      }
    }]), _getPayment(req).aggregate([{
      $match: {
        ...matchBase,
        status: "active"
      }
    }, {
      $group: {
        _id: "$paymentMethod",
        total: {
          $sum: "$amount"
        },
        count: {
          $sum: 1
        }
      }
    }])]);
    const inv = invoiceSummary[0] || {
      totalBilled: 0,
      totalPaid: 0,
      invoiceCount: 0,
      paidCount: 0,
      partialCount: 0
    };
    const byMethod = {};
    let totalCollected = 0;
    for (const row of paymentSummary) {
      byMethod[row._id] = {
        total: row.total,
        count: row.count
      };
      totalCollected += row.total;
    }
    return {
      date,
      branchId: branchId || null,
      invoices: {
        totalBilled: inv.totalBilled,
        totalPaid: inv.totalPaid,
        outstanding: +(inv.totalBilled - inv.totalPaid).toFixed(2),
        count: inv.invoiceCount,
        paidCount: inv.paidCount,
        partialCount: inv.partialCount
      },
      collections: {
        totalCollected,
        byMethod
      }
    };
  }

  /**
   * getMonthlySummary
   * Revenue and outstanding totals for a full calendar month.
   */
  async getMonthlySummary({
    req,
    year,
    month,
    branchId
  }) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const matchBase = {
      createdAt: {
        $gte: monthStart,
        $lte: monthEnd
      }
    };
    if (branchId) matchBase.branchId = new mongoose.Types.ObjectId(branchId);
    const [invoiceSummary, paymentSummary, dailyRevenue] = await Promise.all([_getInvoice(req).aggregate([{
      $match: {
        ...matchBase,
        status: {
          $in: ["issued", "partially_paid", "paid"]
        }
      }
    }, {
      $group: {
        _id: null,
        totalBilled: {
          $sum: "$totalAmount"
        },
        invoiceCount: {
          $sum: 1
        },
        paidCount: {
          $sum: {
            $cond: [{
              $eq: ["$status", "paid"]
            }, 1, 0]
          }
        }
      }
    }]), _getPayment(req).aggregate([{
      $match: {
        ...matchBase,
        status: "active"
      }
    }, {
      $group: {
        _id: "$paymentMethod",
        total: {
          $sum: "$amount"
        },
        count: {
          $sum: 1
        }
      }
    }]), _getPayment(req).aggregate([{
      $match: {
        ...matchBase,
        status: "active"
      }
    }, {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt"
          }
        },
        revenue: {
          $sum: "$amount"
        },
        count: {
          $sum: 1
        }
      }
    }, {
      $sort: {
        _id: 1
      }
    }])]);
    const inv = invoiceSummary[0] || {
      totalBilled: 0,
      invoiceCount: 0,
      paidCount: 0
    };
    const byMethod = {};
    let totalCollected = 0;
    for (const row of paymentSummary) {
      byMethod[row._id] = {
        total: row.total,
        count: row.count
      };
      totalCollected += row.total;
    }
    return {
      year,
      month,
      branchId: branchId || null,
      invoices: {
        totalBilled: inv.totalBilled,
        outstanding: +(inv.totalBilled - totalCollected).toFixed(2),
        count: inv.invoiceCount,
        paidCount: inv.paidCount
      },
      collections: {
        totalCollected,
        byMethod,
        byDay: dailyRevenue.map(d => ({
          date: d._id,
          revenue: d.revenue,
          count: d.count
        }))
      }
    };
  }

  /**
   * getOutstandingBalances
   * Patients with unpaid/partial invoices — sorted by balance descending.
   */
  async getOutstandingBalances({
    req,
    branchId,
    limit = 50
  }) {
    const matchBase = {
      status: {
        $in: ["issued", "partially_paid"]
      }
    };
    if (branchId) matchBase.branchId = new mongoose.Types.ObjectId(branchId);
    const results = await _getInvoice(req).aggregate([{
      $match: matchBase
    }, {
      $group: {
        _id: "$patientId",
        outstandingTotal: {
          $sum: "$totalAmount"
        },
        invoiceCount: {
          $sum: 1
        },
        oldestInvoice: {
          $min: "$createdAt"
        }
      }
    }, {
      $sort: {
        outstandingTotal: -1
      }
    }, {
      $limit: Math.min(limit, 200)
    }], req);
    return {
      branchId: branchId || null,
      topOutstanding: results.map(r => ({
        patientId: r._id,
        outstandingTotal: r.outstandingTotal,
        invoiceCount: r.invoiceCount,
        oldestInvoice: r.oldestInvoice
      }))
    };
  }
}

// Singleton export — matches original billingSummary.service.js interface
module.exports = new ClinicAnalyticsService();