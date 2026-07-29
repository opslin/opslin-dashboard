import { notFound } from "next/navigation";
import { CopyableCode } from "@/components/docs/copyable-code";

type DocSection = {
    title: string;
    body?: string;
    code?: Array<{ label: string; value: string }>;
};

const pages: Record<string, { title: string; sections: DocSection[] }> = {
    "connect-github": {
        title: "Connect GitHub",
        sections: [
            {
                title: "GitHub App settings",
                code: [
                    { label: "Homepage URL", value: "https://opslin.shotlin.in" },
                    { label: "Callback and setup URL", value: "https://apiopslin.shotlin.in/github/callback" },
                    { label: "Webhook URL", value: "https://apiopslin.shotlin.in/github/webhook" },
                ],
            },
            {
                title: "Permissions",
                body: "Metadata, Contents, and Pull requests should be read-only. Subscribe to installation target, pull request, and push events.",
            },
        ],
    },
    "deploy-first-app": {
        title: "Deploy Your First App",
        sections: [
            {
                title: "Agent install",
                code: [
                    { label: "Linux VPS", value: "curl -fsSL https://apiopslin.shotlin.in/agent/install | sudo bash" },
                    { label: "Local macOS", value: "curl -fsSL https://apiopslin.shotlin.in/agent/install/macos | bash" },
                ],
            },
            {
                title: "Deploy flow",
                body: "Connect a server, connect GitHub, select a repository and branch, then deploy while the progress stepper streams build logs.",
            },
        ],
    },
    "billing-and-common-errors": {
        title: "Billing And Common Errors",
        sections: [
            {
                title: "Checkout rules",
                body: "Free and Starter never open Razorpay. Pro opens Razorpay for ₹943/month. Business opens Razorpay for ₹1,769/month. Enterprise uses contact sales.",
            },
            {
                title: "Invoices",
                body: "Invoices show base amount, GST at 18 percent, and total amount separately for Indian tax compliance.",
            },
        ],
    },
};

export default async function DashboardDocsPage({ params }: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await params;
    const page = pages[resolvedParams.slug];
    if (!page) {
        notFound();
    }

    return (
        <main className="min-h-screen bg-background px-6 py-12 text-foreground">
            <article className="mx-auto max-w-3xl space-y-8">
                <h1 className="text-4xl font-semibold tracking-tight">{page.title}</h1>
                {page.sections.map((section) => (
                    <section key={section.title} className="space-y-3">
                        <h2 className="text-xl font-semibold">{section.title}</h2>
                        {section.body ? <p className="text-muted-foreground">{section.body}</p> : null}
                        {section.code ? (
                            <div className="space-y-2">
                                {section.code.map((entry) => (
                                    <CopyableCode key={entry.value} code={entry.value} label={entry.label} />
                                ))}
                            </div>
                        ) : null}
                    </section>
                ))}
            </article>
        </main>
    );
}
