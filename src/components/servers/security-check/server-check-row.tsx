"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "@/components/security-check/rows";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { gradeClass } from "@/components/security-check/format";
import { isActiveHostCheck, isFeatureOff, useHostCheck } from "./use-host-check";

/** One quiet row in the server's Security tab. Hidden entirely when the check is not enabled for the organization. */
export function ServerCheckRow({ serverId }: { serverId: string }) {
    const latest = useHostCheck(serverId);
    if (latest.isLoading || isFeatureOff(latest.error)) return null;
    const check = latest.data?.check ?? null;
    const running = isActiveHostCheck(check);

    let state: React.ReactNode = "Not run yet";
    if (running) state = <span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Checking…</span>;
    else if (check?.status === "COMPLETED") {
        state = (
            <span>
                <span className={check.graded ? gradeClass(check.grade) : undefined}>{check.graded && check.grade ? `Grade ${check.grade}` : "Incomplete"}</span>
                {check.completedAt ? ` · ${formatRelativeTime(check.completedAt)}` : ""}
            </span>
        );
    } else if (check?.status === "FAILED") state = "Last check didn't finish";
    else if (latest.isError) state = "Couldn't load";

    return (
        <Panel>
            <Section>
                <Row
                    label="Server security check"
                    state={state}
                    action={
                        <Button asChild variant={check ? "ghost" : "outline"} size="sm">
                            <Link href={`/servers/${serverId}/security-check`}>{check ? "View" : "Run check"}</Link>
                        </Button>
                    }
                />
            </Section>
        </Panel>
    );
}
