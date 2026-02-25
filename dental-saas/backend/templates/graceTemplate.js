module.exports = function graceTemplate(org, graceEndsAt) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #d97706;">Action Required: Subscription Payment Overdue</h2>
        <p>Dear ${org.name} team,</p>
        <p>Your subscription payment is overdue. To ensure uninterrupted access to your account, we have initiated a grace period.</p>
        <div style="background-color: #fef3c7; border: 1px solid #fde68a; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Grace Period Ends On: ${new Date(graceEndsAt).toLocaleDateString()}</p>
        </div>
        <p>If payment is not resolved by the end of the grace period, your organization's access will be suspended.</p>
        <p>Please log in to your dashboard to settle the outstanding balance as soon as possible.</p>
        <p style="margin-top: 30px; font-size: 0.9em; color: #777;">If you have already paid this invoice, please disregard this notice.</p>
    </div>
    `;
};
