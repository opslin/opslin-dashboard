import Link from "next/link";

const pages = [
    ["Connect GitHub", "/docs/connect-github"],
    ["Deploy Your First App", "/docs/deploy-first-app"],
    ["Billing And Common Errors", "/docs/billing-and-common-errors"],
] as const;

export default function DocsIndexPage() {
    return (
        <main className="min-h-screen bg-background px-6 py-12 text-foreground">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className="text-4xl font-semibold tracking-tight">Opslin Docs</h1>
                <div className="grid gap-3">
                    {pages.map(([title, href]) => (
                        <Link key={href} href={href} className="rounded-lg border border-border p-4 font-medium hover:bg-muted">
                            {title}
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
}
