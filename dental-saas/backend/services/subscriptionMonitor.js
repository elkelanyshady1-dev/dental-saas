const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const Invoice = require("../models/Invoice");
const PlatformNotification = require("../models/PlatformNotification");
const PlatformConfig = require("../models/PlatformConfig");
const computeSubscriptionHealth = require("../utils/subscriptionHealth");
const emailService = require("./emailService");
const logger = require("../utils/logger");

const PLAN_PRICING = {
    basic: 1000,
    pro: 2500,
    enterprise: 6000,
};

/**
 * Scans active organizations daily to flag expiring subscriptions, auto-suspend expired ones,
 * and generate renewal invoices safely and transactionally.
 */
async function scanSubscriptions() {
    try {
        logger.info({ service: "SubscriptionMonitor", action: "scan_start" }, "Starting daily base scan");
        const config = await PlatformConfig.findOne() || { retryAttempts: 3, gracePeriodDays: 7, retryIntervalDays: 2, autoSuspend: true };

        const orgs = await Organization.find({ "subscription.status": { $ne: "suspended" } });
        let suspendedCount = 0;
        let warningCount = 0;
        let renewalCount = 0;

        for (const org of orgs) {
            const health = computeSubscriptionHealth(org.subscription);
            if (!health) continue;

            const isCurrentlyExpired = health.isExpired || health.daysRemaining <= 0;
            const isExpiringSoon = health.isExpiringSoon;
            const now = new Date();

            // ─── Phase 3: Renewal Engine (Transaction Safe) ──────────────────
            // Trigger renewal invoice generation if past currentPeriodEnd
            if (org.subscription.currentPeriodEnd && now > new Date(org.subscription.currentPeriodEnd)) {

                // Prevent duplicate invoices by checking if one exists that is actively pending for this org
                const activeInvoice = await Invoice.findOne({
                    organizationId: org._id,
                    status: { $in: ["pending", "failed"] }
                });

                if (!activeInvoice) {
                    // Try to execute atomic renewal
                    const session = await mongoose.startSession();
                    try {
                        session.startTransaction();

                        // Lock and re-fetch the organization
                        const lockedOrg = await Organization.findById(org._id).session(session);

                        // Safety re-check: another worker might have renewed and extended it
                        if (!lockedOrg || new Date(lockedOrg.subscription.currentPeriodEnd) > now) {
                            await session.abortTransaction();
                            session.endSession();
                            continue; // Skip, it was already handled
                        }

                        const sub = lockedOrg.subscription;

                        // --- Phase 10: Scheduled Plan Change Processing ---
                        if (sub.scheduledPlanChange && sub.scheduledPlanChange.newPlan && now >= new Date(sub.scheduledPlanChange.effectiveDate)) {
                            sub.plan = sub.scheduledPlanChange.newPlan;
                            sub.scheduledPlanChange = null;
                            sub.basePriceAtSubscription = null; // allow fall-through to standard PLAN_PRICING

                            await AuditLog.create([{
                                organizationId: lockedOrg._id,
                                action: "PLATFORM_PLAN_CHANGE_EXECUTED",
                                actorType: "system",
                                success: true,
                                details: `Scheduled plan change to ${sub.plan} applied at renewal.`,
                                ipAddress: "system",
                                userAgent: "SubscriptionMonitorCron",
                            }], { session });

                            await PlatformNotification.create([{
                                type: "PLAN_CHANGED",
                                title: "Plan Automatically Changed",
                                message: `${lockedOrg.name} upgraded/downgraded to ${sub.plan} as scheduled.`,
                                organizationId: lockedOrg._id,
                                severity: "info"
                            }], { session });
                        }

                        // 1. Resolve base plan price
                        let basePrice = PLAN_PRICING[sub.plan] || 0;

                        // 2. Custom Pricing Override
                        if (sub.customPricing && sub.customPricing.isCustom) {
                            basePrice = sub.customPricing.price;
                        }

                        // Set the new base price before inflation
                        let newBasePrice = sub.basePriceAtSubscription || basePrice;

                        // 3. Apply Inflation First (Enterprise Rule)
                        let inflationApplied = 0;
                        if (sub.renewalPolicy && sub.renewalPolicy.inflationPercent > 0) {
                            inflationApplied = newBasePrice * (sub.renewalPolicy.inflationPercent / 100);
                            newBasePrice = newBasePrice + inflationApplied;
                        }

                        // 4. Apply Coupon
                        let couponDiscount = 0;
                        let validCoupon = false;
                        if (sub.coupon && sub.coupon.code) {
                            const c = sub.coupon;
                            const isNotExpired = !c.validUntil || now <= new Date(c.validUntil);
                            const hasUsesLeft = !c.maxUses || c.usedCount < c.maxUses;
                            const isTargetPlan = !c.planRestriction || c.planRestriction === sub.plan;

                            if (isNotExpired && hasUsesLeft && isTargetPlan) {
                                validCoupon = true;
                                if (c.discountType === "percentage") {
                                    couponDiscount = newBasePrice * (c.discountValue / 100);
                                } else if (c.discountType === "fixed") {
                                    couponDiscount = c.discountValue;
                                }
                            }
                        }

                        let finalAmount = Math.max(0, newBasePrice - couponDiscount);

                        // --- Phase 16: Credit Balance Consumption ---
                        let unusedCreditApplied = 0;
                        if (sub.creditBalance && sub.creditBalance > 0) {
                            if (sub.creditBalance >= finalAmount) {
                                unusedCreditApplied = finalAmount;
                                lockedOrg.subscription.creditBalance -= finalAmount;
                                finalAmount = 0;
                            } else {
                                unusedCreditApplied = sub.creditBalance;
                                finalAmount -= sub.creditBalance;
                                lockedOrg.subscription.creditBalance = 0;
                            }
                        }

                        // 5. Atomic Invoice Generation
                        const invoice = new Invoice({
                            organizationId: lockedOrg._id,
                            subscriptionSnapshot: {
                                plan: sub.plan,
                                billingCycle: "monthly",
                                basePrice: newBasePrice - inflationApplied, // Original before inflation
                                inflationApplied,
                                couponDiscount,
                                unusedCreditApplied,
                                finalAmount,
                                currencyAtBilling: "USD",
                            },
                            status: sub.autoRenew ? "paid" : "pending",
                            dueDate: new Date(now.getTime() + (config.gracePeriodDays) * 24 * 60 * 60 * 1000), // Due at end of grace
                            retryCount: 0,
                            maxRetries: config.retryAttempts,
                            nextRetryAt: sub.autoRenew ? null : new Date(now.getTime() + config.retryIntervalDays * 24 * 60 * 60 * 1000), // Start retry period based on config
                        });

                        if (sub.autoRenew) {
                            invoice.paidAt = now;

                            // Extend currentPeriodEnd strictly accurately
                            const newEnd = new Date(lockedOrg.subscription.currentPeriodEnd);
                            newEnd.setMonth(newEnd.getMonth() + 1);
                            lockedOrg.subscription.currentPeriodEnd = newEnd;

                            lockedOrg.subscription.basePriceAtSubscription = newBasePrice;
                            lockedOrg.subscription.graceEndsAt = null; // Clear grace since paid
                            lockedOrg.subscription.status = "active";

                            if (validCoupon) {
                                lockedOrg.subscription.coupon.usedCount += 1;
                            }
                        }

                        await invoice.save({ session });
                        await lockedOrg.save({ session });

                        await AuditLog.create([{
                            organizationId: lockedOrg._id,
                            action: sub.autoRenew ? "SUBSCRIPTION_RENEWAL_SUCCESS" : "SUBSCRIPTION_INVOICE_GENERATED",
                            actorType: "system",
                            success: true,
                            details: `Invoice generated for ${finalAmount}. AutoRenew: ${sub.autoRenew}`,
                            ipAddress: "system",
                            userAgent: "SubscriptionMonitorCron",
                        }], { session });

                        await session.commitTransaction();
                        session.endSession();
                        renewalCount++;

                        // Fire-and-forget Email Dispatch (Phase 9)
                        emailService.sendInvoiceEmail(invoice, lockedOrg).catch(err => {
                            console.error(`[SubscriptionMonitor] Non-blocking email error for Invoice ${invoice._id}:`, err);
                        });

                        // If autoRenew succeeded, it's no longer expired
                        if (sub.autoRenew) {
                            continue;
                        }
                    } catch (err) {
                        await session.abortTransaction();
                        session.endSession();
                        logger.error({ err, service: "SubscriptionMonitor", action: "renewal_processing_failed", orgName: org.name }, "Failed renewal processing for org");
                    }
                }

                // ─── Phase 5: Trial Auto Expiry ──────────────────
                if (org.subscription.status === "trial" && (org.subscription.trialEndsAt || org.subscription.currentPeriodEnd)) {
                    // Backward-compat: some might have trialEndsAt, others currentPeriodEnd
                    const trialEndsAtDate = org.subscription.trialEndsAt || org.subscription.currentPeriodEnd;
                    const trialEndsAt = new Date(trialEndsAtDate);
                    const gracePeriodDays = 3;
                    const graceEndsAt = new Date(trialEndsAt);
                    graceEndsAt.setDate(trialEndsAt.getDate() + gracePeriodDays);

                    if (now > graceEndsAt) {
                        // Grace period exhausted -> Deactivate
                        if (org.isActive || org.subscription.status !== "expired") {
                            logger.info({ service: "SubscriptionMonitor", action: "trial_grace_exhausted", orgName: org.name }, "Trial grace exhausted. Suspending organization.");
                            org.isActive = false;
                            org.subscription.status = "expired";
                            await org.save();

                            await AuditLog.create({
                                organizationId: org._id,
                                action: "TRIAL_EXPIRED_SUSPENDED",
                                actorType: "system",
                                success: true,
                                details: `Trial grace period (${gracePeriodDays} days) exhausted. Organization suspended.`,
                                ipAddress: "system",
                                userAgent: "SubscriptionMonitorCron",
                            });
                        }
                        continue; // Skip further checks for this org
                    } else if (now > trialEndsAt) {
                        // Trial expired, but inside grace period
                        if (org.subscription.status !== "expired") {
                            logger.info({ service: "SubscriptionMonitor", action: "trial_expired_grace_started", orgName: org.name }, "Trial expired. Entering 3-day grace period.");
                            org.subscription.status = "expired";
                            await org.save();

                            await AuditLog.create({
                                organizationId: org._id,
                                action: "TRIAL_EXPIRED_GRACE",
                                actorType: "system",
                                success: true,
                                details: `Trial ended. 3-day grace period started before suspension.`,
                                ipAddress: "system",
                                userAgent: "SubscriptionMonitorCron",
                            });
                        }
                    }
                }
            }

            // ─── Original Suspension Logic (Grace Period Aware) ──────────
            if (isCurrentlyExpired) {
                const graceEndsAt = org.subscription.graceEndsAt ? new Date(org.subscription.graceEndsAt) : null;

                if (graceEndsAt && now <= graceEndsAt) {
                    continue; // Still inside grace window -> skip suspension
                }

                if (org.subscription.status !== "suspended") {
                    if (!config.autoSuspend) {
                        logger.info({ service: "SubscriptionMonitor", action: "auto_suspend_disabled", orgName: org.name }, "Auto-suspend disabled via config. Skipping.");
                        continue;
                    }
                    logger.info({ service: "SubscriptionMonitor", action: "auto_suspending_org", orgName: org.name }, "Auto-suspending org (Grace exhausted/none)");
                    await Organization.findByIdAndUpdate(org._id, {
                        $set: {
                            "subscription.status": "suspended",
                            isActive: false,
                        },
                    });

                    await AuditLog.create({
                        organizationId: org._id,
                        action: "SUBSCRIPTION_AUTO_SUSPENDED",
                        actorType: "system",
                        success: true,
                        details: `Subscription expired and grace period exhausted.`,
                        ipAddress: "system",
                        userAgent: "SubscriptionMonitorCron",
                    });

                    await PlatformNotification.create({
                        type: "ORG_SUSPENDED",
                        title: "Organization Suspended",
                        message: `${org.name} was suspended due to billing expiration.`,
                        organizationId: org._id,
                        severity: "critical"
                    });

                    // Fire-and-forget Suspension Notice (Phase 12)
                    emailService.sendSuspensionEmail(org).catch(err => {
                        logger.error({ err, service: "SubscriptionMonitor", action: "suspension_email_error", orgId: org._id }, "Non-blocking email error for Suspension");
                    });

                    suspendedCount++;
                }
            } else if (isExpiringSoon) {
                const recentWarning = await AuditLog.findOne({
                    organizationId: org._id,
                    action: "SUBSCRIPTION_EXPIRING_SOON",
                    createdAt: { $gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
                });

                if (!recentWarning && org.subscription.status !== "suspended") {
                    logger.info({ service: "SubscriptionMonitor", action: "emitting_expiring_warning", orgName: org.name }, "Emitting expiring warning for org");
                    await AuditLog.create({
                        organizationId: org._id,
                        action: "SUBSCRIPTION_EXPIRING_SOON",
                        actorType: "system",
                        success: true,
                        details: `Subscription expires in ${health.daysRemaining} days.`,
                        ipAddress: "system",
                        userAgent: "SubscriptionMonitorCron",
                    });

                    await PlatformNotification.create({
                        type: "SUBSCRIPTION_EXPIRING",
                        title: "Subscription Expiring Soon",
                        message: `${org.name} subscription will expire in ${health.daysRemaining} days.`,
                        organizationId: org._id,
                        severity: "warning"
                    });
                    warningCount++;
                }
            }
        }

        logger.info({
            service: "SubscriptionMonitor",
            action: "daily_scan_complete",
            suspended: suspendedCount,
            renewals: renewalCount,
            warnings: warningCount
        }, "Scan complete");
    } catch (err) {
        logger.error({ err, service: "SubscriptionMonitor", action: "scan_error" }, "Error during scan");
    }
}

// ─── Phase 4: Enterprise Dunning (Retry Daemon) ──────────────────────────
async function scanPendingInvoices() {
    try {
        logger.info({ service: "SubscriptionMonitor", action: "invoice_scan_start" }, "Starting daily pending invoice scan");
        const config = await PlatformConfig.findOne() || { retryAttempts: 3, retryIntervalDays: 2 };

        const now = new Date();
        const pendingInvoices = await Invoice.find({
            status: "pending",
            retryCount: { $lt: config.retryAttempts }, // Config-based retry limit
            nextRetryAt: { $lte: now }
        }).populate("organizationId");

        for (const invoice of pendingInvoices) {
            const org = invoice.organizationId;
            if (!org) continue;

            const sub = org.subscription;
            // Skip if provider is manual -> wait for them to pay
            if (sub.paymentProvider && sub.paymentProvider.provider === "manual") {
                continue;
            }

            // Retry logic must respect grace period. If past grace, do not retry, suspension will trigger
            if (sub.graceEndsAt && now > new Date(sub.graceEndsAt)) {
                logger.info({ service: "SubscriptionMonitor", action: "retry_skipped_past_grace", invoiceId: invoice._id }, "Skipping retry for Invoice; past grace period.");
                continue;
            }

            const session = await mongoose.startSession();
            try {
                session.startTransaction();

                // Idempotency: Re-fetch invoice inside transaction and confirm
                const lockedInvoice = await Invoice.findById(invoice._id).session(session);
                if (lockedInvoice.status !== "pending") {
                    await session.abortTransaction();
                    session.endSession();
                    continue;
                }

                // Simulate Stripe attempt logic here
                const paymentSuccess = false; // Simulation hardcoded to fail for testing.

                if (paymentSuccess) {
                    lockedInvoice.status = "paid";
                    lockedInvoice.paidAt = now;
                    await lockedInvoice.save({ session });

                    // Extend subscription
                    const newEnd = new Date(org.subscription.currentPeriodEnd);
                    newEnd.setMonth(newEnd.getMonth() + 1);

                    await Organization.findByIdAndUpdate(org._id, {
                        $set: {
                            "subscription.currentPeriodEnd": newEnd,
                            "subscription.basePriceAtSubscription": lockedInvoice.subscriptionSnapshot.basePrice + lockedInvoice.subscriptionSnapshot.inflationApplied,
                            "subscription.graceEndsAt": null,
                            "subscription.status": "active"
                        }
                    }, { session });

                    await AuditLog.create([{
                        organizationId: org._id,
                        action: "SUBSCRIPTION_RETRY_SUCCESS",
                        actorType: "system",
                        success: true,
                        details: `Retry successful. Invoice ${lockedInvoice._id} marked paid.`,
                        ipAddress: "system",
                        userAgent: "SubscriptionMonitorCron",
                    }], { session });

                } else {
                    // Payment Failed
                    lockedInvoice.retryCount += 1;
                    lockedInvoice.lastRetryAt = now;
                    lockedInvoice.failureReason = "Card declined (Simulated)";

                    if (lockedInvoice.retryCount >= lockedInvoice.maxRetries) {
                        // Max retries exhausted
                        await AuditLog.create([{
                            organizationId: org._id,
                            action: "SUBSCRIPTION_RETRY_EXHAUSTED",
                            actorType: "system",
                            success: false,
                            details: `Max retries (${lockedInvoice.maxRetries}) reached for Invoice ${lockedInvoice._id}.`,
                            ipAddress: "system",
                            userAgent: "SubscriptionMonitorCron",
                        }], { session });

                        await PlatformNotification.create([{
                            type: "RETRY_EXHAUSTED",
                            title: "Payment Retries Exhausted",
                            message: `Payment collection failed permanently for ${org.name}.`,
                            organizationId: org._id,
                            severity: "critical"
                        }], { session });
                        // Do not auto-suspend here! scanSubscriptions does that.
                    } else {
                        // Schedule next retry based on config
                        lockedInvoice.nextRetryAt = new Date(now.getTime() + config.retryIntervalDays * 24 * 60 * 60 * 1000);
                        await AuditLog.create([{
                            organizationId: org._id,
                            action: "SUBSCRIPTION_RETRY_FAILED",
                            actorType: "system",
                            success: false,
                            details: `Retry ${lockedInvoice.retryCount} failed for Invoice ${lockedInvoice._id}.`,
                            ipAddress: "system",
                            userAgent: "SubscriptionMonitorCron",
                        }], { session });

                        await PlatformNotification.create([{
                            type: "RETRY_FAILED",
                            title: "Payment Retry Failed",
                            message: `Retry ${lockedInvoice.retryCount} failed for ${org.name}.`,
                            organizationId: org._id,
                            severity: "warning"
                        }], { session });
                    }

                    await lockedInvoice.save({ session });
                }

                await session.commitTransaction();
                session.endSession();

                // Fire-and-forget Retry Email Dispatch (Phase 11)
                // We only send if it wasn't a success (meaning paymentSuccess was false)
                if (!paymentSuccess) {
                    emailService.sendRetryFailedEmail(org, lockedInvoice).catch(err => {
                        logger.error({ err, service: "SubscriptionMonitor", action: "retry_email_error", invoiceId: lockedInvoice._id }, "Non-blocking email error for Retry Invoice");
                    });
                }

            } catch (err) {
                await session.abortTransaction();
                session.endSession();
                logger.error({ err, service: "SubscriptionMonitor", action: "retry_processing_failed", invoiceId: invoice._id }, "Failed to process pending invoice");
            }
        }
    } catch (err) {
        logger.error({ err, service: "SubscriptionMonitor", action: "invoice_scan_error" }, "Error during pending invoice scan");
    }
}

module.exports = { scanSubscriptions, scanPendingInvoices };
