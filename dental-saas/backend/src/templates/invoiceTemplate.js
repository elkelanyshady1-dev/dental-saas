module.exports = function invoiceTemplate(invoice) {
    const meta = invoice.metadata || {};
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2>Invoice Created</h2>
        <p>A new invoice has been generated for your subscription.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Invoice ID:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${invoice._id}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Plan:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; text-transform: capitalize;">${meta.plan || 'Subscription'}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Due Date:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${new Date(invoice.dueDate).toLocaleDateString()}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Base Price:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">$${invoice.basePlanAmount}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Inflation Applied:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">+$${meta.inflationApplied || 0}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Coupon Discount:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">-$${invoice.couponDiscountAmount || 0}</td>
            </tr>
            <tr>
                <td style="padding: 10px; font-weight: bold; font-size: 1.2em;">Total Amount:</td>
                <td style="padding: 10px; font-weight: bold; font-size: 1.2em;">$${invoice.totalAmount} ${invoice.currency || "USD"}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Status:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold; text-transform: uppercase;">${invoice.status}</td>
            </tr>
        </table>
        <p style="margin-top: 30px;">A PDF copy of this invoice is attached to this email.</p>
        <p style="margin-top: 30px; font-size: 0.9em; color: #777;">Thank you for your business!</p>
    </div>
    `;
};
