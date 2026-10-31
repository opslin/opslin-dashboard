export default function InsightsLayout({ children }: { children: React.ReactNode }) {
    // The dashboard shell gives pages no side space of their own; every page adds its own gutter and a readable width.
    return <div className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>;
}
