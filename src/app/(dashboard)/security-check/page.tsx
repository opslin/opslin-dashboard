"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "@/components/security-check/rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { DomainStep } from "@/components/security-check/domain-step";
import { ResultsStep } from "@/components/security-check/results-step";
import { StepIndicator, type CheckStep } from "@/components/security-check/steps";
import { errorMessage, useSecurityCheckOverview, useSecurityCheckTarget } from "@/components/security-check/use-security-check";
import { VerifyStep } from "@/components/security-check/verify-step";

function Loading() {
    return (
        <Panel aria-busy="true" aria-label="Loading security check">
            <Section>
                <Row label={<SkeletonText className="h-4 w-48" />} />
                <Row label={<SkeletonText className="h-4 w-32" />} />
            </Section>
        </Panel>
    );
}

function SecurityCheck() {
    const router = useRouter();
    const params = useSearchParams();
    const selectedId = params.get("domain");
    const overview = useSecurityCheckOverview();
    const selected = useSecurityCheckTarget(selectedId);

    const open = (id: string) => router.push(`/security-check?domain=${encodeURIComponent(id)}`);
    const home = () => router.push("/security-check");

    const target = selectedId ? (selected.data?.target ?? overview.data?.targets.find((t) => t.id === selectedId) ?? null) : null;
    const step: CheckStep = !selectedId ? 1 : target?.verified ? 3 : 2;
    const usage = overview.data?.usage;

    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-1 pb-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Security check</h1>
                {usage ? (
                    <p className="text-sm text-muted-foreground" aria-label="Checks used this month">
                        {usage.used} of {usage.limit} checks used this month
                    </p>
                ) : null}
            </div>
            <StepIndicator current={step} />

            {overview.isLoading || (selectedId && selected.isLoading && !target) ? (
                <Loading />
            ) : overview.isError ? (
                <Panel>
                    <Section>
                        <Row label="Couldn't load your security checks" state={errorMessage(overview.error, "Try again in a moment.")} action={<Button variant="ghost" size="sm" onClick={() => overview.refetch()}>Try again</Button>} />
                    </Section>
                </Panel>
            ) : selectedId && !target ? (
                <Panel>
                    <Section>
                        <Row label="That domain isn't in your list" action={<Button variant="ghost" size="sm" onClick={home}>Back</Button>} />
                    </Section>
                </Panel>
            ) : step === 1 ? (
                <DomainStep targets={overview.data?.targets ?? []} onOpen={open} />
            ) : step === 2 && target ? (
                <VerifyStep target={target} onBack={home} />
            ) : target ? (
                <ResultsStep target={target} usage={usage} />
            ) : null}
        </div>
    );
}

export default function SecurityCheckPage() {
    return (
        <Suspense fallback={<Loading />}>
            <SecurityCheck />
        </Suspense>
    );
}
