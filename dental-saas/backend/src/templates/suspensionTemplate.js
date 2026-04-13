module.exports = function suspensionTemplate(org) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">Account Suspended</h2>
        <p>Dear ${org.name} team,</p>
        <p>We regret to inform you that your organization's access to the platform has been suspended.</p>
        <p>This action was taken because your subscription payment has remained unpaid beyond the allowed grace period.</p>
        
        <div style="background-color: #fee2e2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0; color: #991b1b;">
            <p style="margin: 0;"><strong>Immediate Action Required:</strong> To restore access to your account and data, please contact billing support or update your payment details immediately.</p>
        </div>
        
        <p>We value your business and hope to resolve this matter quickly so you can continue using the platform.</p>
        <p style="margin-top: 30px; font-size: 0.9em; color: #777;">All your clinical data remains secure and intact despite the suspension.</p>
    </div>
    `;
};
