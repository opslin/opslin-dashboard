import Link from "next/link";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-background px-6 py-12 text-foreground">
            <div className="mx-auto max-w-3xl space-y-8">
                <div className="space-y-3">
                    <Link href="/" className="text-sm font-medium text-primary">Opslin</Link>
                    <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
                    <p className="text-muted-foreground">Last updated: April 26, 2026</p>
                </div>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Data We Process</h2>
                    <p className="text-muted-foreground">
                        Opslin stores account details, organization membership, server metadata, deployment records, billing plan state, and operational logs needed to run the platform.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">GitHub And Infrastructure Access</h2>
                    <p className="text-muted-foreground">
                        Repository access is limited to the GitHub App installation permissions granted by the user. Server access is handled through the Opslin agent token and encrypted platform credentials.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Payments</h2>
                    <p className="text-muted-foreground">
                        Paid plan checkout is handled by Razorpay. Opslin records subscription and invoice metadata, including base amount, GST, total amount, payment status, and invoice identifiers.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Retention And Rights</h2>
                    <p className="text-muted-foreground">
                        Organization owners may request data export or deletion by contacting support. Operational audit records may be retained where required for security, abuse prevention, or tax compliance.
                    </p>
                </section>
            </div>
        </main>
    );
}
