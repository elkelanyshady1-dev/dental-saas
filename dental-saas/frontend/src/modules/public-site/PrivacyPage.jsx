export default function PrivacyPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-24">
            <h1 className="text-4xl font-black text-slate-900 mb-8 tracking-tight">Privacy Policy</h1>
            <div className="prose prose-slate lg:prose-lg max-w-none text-slate-600 leading-relaxed space-y-6">
                <p className="text-xl font-medium text-slate-800">Effective Date: February 24, 2026</p>
                <p>
                    At DentalSaaS, we prioritize the protection of your practice's data and your patients' privacy. This policy outlines how we handle information across our platform.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">1. Data Collection</h2>
                <p>
                    We collect minimal identity data (name, email) and practice-related information necessary to provide the DentalSaaS operating system. All patient records are encrypted and stored according to global healthcare standards.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">2. Data Usage</h2>
                <p>
                    Your data belongs to you. We do not sell your data or use patient information for marketing purposes. Data is used strictly for technical operations and platform improvements.
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-12">3. Security</h2>
                <p>
                    We employ industry-leading encryption and security protocols to ensure your data remains confidential and secure.
                </p>
            </div>
        </div>
    );
}
