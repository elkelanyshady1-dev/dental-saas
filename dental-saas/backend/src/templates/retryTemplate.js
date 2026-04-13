module.exports = function retryTemplate(org, invoice, exhausted = false) {
    const isExhausted = exhausted || (invoice.retryCount >= invoice.maxRetries);

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: ${isExhausted ? '#dc2626' : '#ea580c'};">Payment Failed ${isExhausted ? '(Action Required)' : ''}</h2>
        <p>Dear ${org.name} team,</p>
        <p>We attempted to process your payment for Invoice <strong>${invoice._id}</strong>, but the transaction failed.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Amount Due:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">$${invoice.totalAmount}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Failure Reason:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${invoice.failureReason || "Transaction declined"}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Attempts:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${invoice.retryCount} / ${invoice.maxRetries}</td>
            </tr>
        </table>

        ${isExhausted
            ? `<div style="background-color: #fee2e2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #b91c1c;">Automatic retries have been exhausted. No further automatic payment attempts will be made.</p>
               </div>
               <p>Your account will be suspended if payment is not received before your grace period expires (${new Date(org.subscription.gracePeriodEnd).toLocaleDateString()}).</p>`
            : `<div style="background-color: #ffedd5; border: 1px solid #fed7aa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #c2410c;">We will automatically retry the payment on ${new Date(invoice.nextRetryAt).toLocaleDateString()}.</p>
               </div>`
        }
        
        <p>Please update your payment information to ensure continued service.</p>
    </div>
    `;
};
