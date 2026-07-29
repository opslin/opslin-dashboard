import Link from "next/link";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background px-6 py-12 text-foreground">
            <div className="mx-auto max-w-3xl space-y-8">
                <div className="space-y-3">
                    <Link href="/" className="text-sm font-medium text-primary">Opslin</Link>
                    <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
                    <p className="text-muted-foreground">Last updated: April 26, 2026</p>
                </div>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Use of Opslin</h2>
                    <p className="text-muted-foreground">
                        Opslin is a deployment control plane for authorized infrastructure. Users are responsible for connecting only servers, repositories, and domains they are allowed to manage.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Billing</h2>
                    <p className="text-muted-foreground">
                        Free and Starter beta trial plans do not open Razorpay checkout. Pro and Business plans are charged at the displayed GST-inclusive totals, with base amount and GST shown separately on invoices.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Availability</h2>
                    <p className="text-muted-foreground">
                        Platform availability depends on the Opslin control plane, connected servers, network access, and third-party services including GitHub, Cloudflare, and Razorpay.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Security</h2>
                    <p className="text-muted-foreground">
                        Users must keep credentials private, rotate compromised secrets, and remove access for team members who no longer require platform access.
                    </p>
                </section>
            </div>
        </main>
    );
}
