import { Header } from "@/components/layout/header";
import { StorageTabs } from "@/components/storage/storage-tabs";

/**
 * One section for everything that lives in the customer's own Cloudflare account:
 * Overview (the single sign-in), Buckets, Backups and Media.
 */
export default function StorageLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Header title="Storage" className="max-w-5xl" />
            <div className="dashboard-page max-w-5xl pb-0 pt-4">
                <StorageTabs />
            </div>
            {children}
        </>
    );
}
