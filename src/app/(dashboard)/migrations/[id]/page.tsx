"use client";

import { useParams } from "next/navigation";
import { BackLink, MigrationDetail } from "@/components/migrations/migration-detail";

export default function MigrationPage() {
    const params = useParams<{ id: string }>();
    return (
        <div className="flex flex-col gap-3">
            <BackLink />
            <MigrationDetail id={params.id} />
        </div>
    );
}
