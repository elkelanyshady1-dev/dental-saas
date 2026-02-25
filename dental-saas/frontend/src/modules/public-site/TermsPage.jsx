export default function TermsPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-24">
            <h1 className="text-4xl font-black text-slate-900 mb-8 tracking-tight">Terms of Service</h1>
            <div className="prose prose-slate lg:prose-lg max-w-none text-slate-600 leading-relaxed space-y-6">
                <p className="text-xl font-medium text-slate-800">Last Updated: February 24, 2026</p>
                <p>
                    By using the DentalSaaS platform, you agree to these terms. Please read them carefully.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">1. Service Usage</h2>
                <p>
                    DentalSaaS provides a software-as-a-service platform for dental practice management. You are responsible for ensuring your use of the service complies with local medical and data protection regulations.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">2. Subscriptions</h2>
                <p>
                    Access to DentalSaaS is provided on a subscription basis. You agree to pay the fees associated with your chosen plan. Failure to maintain a valid payment method may result in service suspension.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">3. Limitation of Liability</h2>
                <p>
                    DentalSaaS is provided "as is". While we strive for 99.9% uptime, we are not liable for any indirect damages resulting from service interruptions or data handling errors by the user.
                </p>
            </div>
        </div>
    );
}
