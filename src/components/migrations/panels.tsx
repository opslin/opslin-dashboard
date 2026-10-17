"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Loader2, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Disclosure, LockedLine, Row, Section } from "@/components/media/media-rows";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMigrationActions, useMigrationDomains } from "@/hooks/use-migrations";
import type { MigrationView, PlanCheck } from "@/lib/migration-types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { errorText } from "./plan-review";
import { MovedApps } from "./moved-apps";
import { formatBytes, pauseLine } from "./format";

/** How long without a heartbeat before the page offers to nudge a migration along. */
const STALLED_MS = 3 * 60_000;

export function Busy({ pending }: { pending: boolean }) {
    return pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null;
}

export function Confirm({
    trigger, title, description, action, onConfirm, destructive,
}: {
    trigger: React.ReactNode;
    title: string;
    description: React.ReactNode;
    action: string;
    onConfirm: () => void;
    destructive?: boolean;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}>
                        {action}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/** A name a person recognizes for the thing being copied: the plan's own label, not an internal key or an image hash. */
function transferLabel(view: MigrationView, itemKey: string): string {
    if (itemKey === "specs") return "How your containers are set up";
    const planned = view.plan?.items.find((i) => i.key === itemKey)?.label;
    return planned ?? itemKey.replace(/^[a-z]+:/, "");
}

/** While something is running: what it is doing, how far along, and nothing else to decide. */
export function ProgressPanel({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const active = view.transfers.filter((t) => t.status === "uploading" || t.status === "uploaded" || t.status === "pending").slice(-3);
    const stalled = view.actions.canResume && Date.now() - new Date(view.updatedAt).getTime() > STALLED_MS;
    const paused = view.writerOwner === "none";

    return (
        <>
            <Section>
                <Row label={view.progress.message || "Working"} state={view.progress.stepsTotal > 0 ? `${view.progress.stepsDone} of ${view.progress.stepsTotal}` : undefined} />
                <div className="px-5 pb-4">
                    <Progress value={view.progress.percent} className="h-1.5" aria-label="Progress" />
                </div>
                {paused ? <LockedLine>Your apps are stopped on {view.source.name} until this finishes.</LockedLine> : null}
                {active.map((t) => (
                    <Row key={`${t.phase}:${t.itemKey}`} label={transferLabel(view, t.itemKey)} state={t.bytes > 0 ? `${formatBytes(t.bytes)} sent` : "Waiting"} />
                ))}
                {stalled ? (
                    <Row
                        label="Nothing has happened for a few minutes"
                        action={
                            <Button variant="outline" onClick={() => actions.resume.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't continue")) })} disabled={actions.resume.isPending}>
                                <Busy pending={actions.resume.isPending} />
                                Continue
                            </Button>
                        }
                    />
                ) : null}
            </Section>
            {view.steps.length > 0 ? (
                <Disclosure label="All steps">
                    <ol className="space-y-1.5 px-5 pb-4 pl-10 text-sm">
                        {view.steps.map((step) => (
                            <li key={step.id} className={cn("flex items-center gap-2", step.state === "pending" ? "text-muted-foreground" : "text-foreground")}>
                                {step.state === "done" ? <Check className="size-3.5" aria-label="Done" /> : step.state === "current" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-label="Running" /> : <span className="size-3.5" aria-hidden="true" />}
                                {step.label}
                            </li>
                        ))}
                    </ol>
                </Disclosure>
            ) : null}
            {view.actions.canAbort && view.status !== "DISCOVERING" ? (
                <Section>
                    <Row
                        label="Changed your mind?"
                        action={
                            <Confirm
                                trigger={<Button variant="ghost">Cancel migration</Button>}
                                title="Cancel this migration?"
                                description={<p>What was created on {view.target.name} for the practice copy is removed. {view.source.name} is not changed.</p>}
                                action="Cancel migration"
                                onConfirm={() => actions.abort.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't cancel")) })}
                            />
                        }
                    />
                </Section>
            ) : null}
        </>
    );
}

function CheckList({ checks }: { checks: PlanCheck[] }) {
    return (
        <ul className="space-y-1.5 px-5 pb-4 pl-10 text-sm">
            {checks.map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                    {c.status === "pass" ? <Check className="mt-0.5 size-3.5 shrink-0" aria-label="Passed" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-label="Warning" />}
                    <span>{c.label}</span>
                    <span className="text-muted-foreground">{c.detail}</span>
                </li>
            ))}
        </ul>
    );
}

/** The practice copy passed. The one decision left is the switch. */
export function ReadyPanel({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const checks = view.verification.rehearsal ?? [];
    const warnings = checks.filter((c) => c.status === "warn").length;
    const pause = pauseLine(view);

    return (
        <>
            <Section>
                <Row
                    leading={<Check className="size-4" aria-hidden="true" />}
                    label="Practice copy checked"
                    state={checks.length > 0 ? `${checks.length - warnings} of ${checks.length} checks passed${warnings ? `, ${warnings} to look at` : ""}` : "Passed"}
                />
                {pause ? <Row label="Your apps pause for" state={pause} /> : null}
                {view.failure?.message ? (
                    <LockedLine>
                        The last switch didn&apos;t start: {view.failure.message}
                        {view.failure.sourceRestored ? ` Your apps are running on ${view.source.name}.` : ""}
                    </LockedLine>
                ) : null}
            </Section>
            {checks.length > 0 ? (
                <Disclosure label="What was checked">
                    <CheckList checks={checks} />
                </Disclosure>
            ) : null}
            <Section>
                <Row
                    label={`Your apps keep running on ${view.source.name} until you switch`}
                    action={
                        <Confirm
                            trigger={<Button disabled={!view.actions.canCutover || actions.cutover.isPending}><Busy pending={actions.cutover.isPending} />Switch to the new server</Button>}
                            title="Switch to the new server?"
                            description={
                                <>
                                    <p>
                                        Your apps stop on {view.source.name} for {pause ?? "a few minutes"} while the final data is copied to {view.target.name}.
                                    </p>
                                    <p>If anything goes wrong before the new server starts, your apps start again on {view.source.name}.</p>
                                    <p>Once the new server is live and saving data, moving back does not bring that new data with it.</p>
                                </>
                            }
                            action="Switch now"
                            onConfirm={() => actions.cutover.mutate(view.planHash ?? "", { onError: (e) => toast.error(errorText(e, "Couldn't start the switch")) })}
                        />
                    }
                />
                {view.actions.canAbort ? (
                    <Row
                        label="Not ready?"
                        action={
                            <Confirm
                                trigger={<Button variant="ghost">Cancel migration</Button>}
                                title="Cancel this migration?"
                                description={<p>The practice copy on {view.target.name} is removed. {view.source.name} is not changed.</p>}
                                action="Cancel migration"
                                onConfirm={() => actions.abort.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't cancel")) })}
                            />
                        }
                    />
                ) : null}
            </Section>
        </>
    );
}

function CopyIp({ value }: { value: string }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}
            aria-label={`Copy ${value}`}
        >
            <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
            Copy
        </Button>
    );
}

const DOMAIN_STATE: Record<string, string> = {
    "new-server": "Points to the new server",
    "current-server": "Still points to the old server",
    elsewhere: "Points somewhere else",
    "no-record": "No address found",
};

/** Live on the new server. Point the addresses over, then accept. */
export function LivePanel({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const domains = useMigrationDomains(view.id, true);
    const checks = view.verification.final ?? [];
    const hasDomains = (domains.data?.domains.length ?? 0) > 0;
    // Sites that had HTTPS on the old server arrive over plain HTTP: say so rather than let it be a surprise.
    const httpsNames = (view.plan?.domains ?? []).filter((d) => d.tls && d.movable).flatMap((d) => d.names.slice(0, 1));

    return (
        <>
            <Section>
                <Row leading={<Check className="size-4" aria-hidden="true" />} label={`Running on ${view.target.name}`} state={checks.length > 0 ? `${checks.length} checks passed` : undefined} />
                {view.writerOwner === "target" ? <Row label={`${view.source.name} is stopped and untouched`} state="Kept as it was" /> : null}
            </Section>
            <MovedApps view={view} />
            {hasDomains ? (
                <Section label="Web addresses">
                    {domains.data!.targetIp ? (
                        <Row label={`Point these at ${domains.data!.targetIp}`} action={<CopyIp value={domains.data!.targetIp} />} />
                    ) : null}
                    {httpsNames.length > 0 ? (
                        <LockedLine>
                            {httpsNames.join(", ")} used HTTPS on {view.source.name}. {view.target.name} serves {httpsNames.length === 1 ? "it" : "them"} over plain HTTP for now, because Opslin does not set up certificates for moved sites yet.
                        </LockedLine>
                    ) : null}
                    {domains.data!.domains.map((d) => (
                        <Row
                            key={d.name}
                            label={d.name}
                            state={
                                <span className={cn(d.state === "new-server" && "text-foreground")}>
                                    {d.state === "new-server" ? <Check className="mr-1.5 inline size-3.5" aria-hidden="true" /> : null}
                                    {DOMAIN_STATE[d.state]}
                                </span>
                            }
                        />
                    ))}
                </Section>
            ) : null}
            {checks.length > 0 ? (
                <Disclosure label="What was checked">
                    <CheckList checks={checks} />
                </Disclosure>
            ) : null}
            <Section>
                <Row
                    label="Accept when it works the way you expect"
                    action={
                        <Button variant={(view.apps ?? []).some((a) => a.state === "ready") ? "outline" : "default"} onClick={() => actions.accept.mutate(undefined, { onSuccess: () => toast.success("Migration finished"), onError: (e) => toast.error(errorText(e, "Couldn't finish")) })} disabled={actions.accept.isPending}>
                            <Busy pending={actions.accept.isPending} />
                            Accept
                        </Button>
                    }
                />
                <Row
                    label="Something wrong?"
                    action={<RecoverButton view={view} />}
                />
            </Section>
        </>
    );
}

function RecoverButton({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    return (
        <Confirm
            trigger={<Button variant="outline" disabled={actions.recover.isPending}><Busy pending={actions.recover.isPending} />Recover service</Button>}
            title="Move back to the old server?"
            description={
                <>
                    <p>Your apps stop on {view.target.name} and start again on {view.source.name}.</p>
                    <p>Anything {view.target.name} saved since the switch is not carried back.</p>
                    {(view.apps ?? []).some((a) => a.state === "ready") ? <p>The apps and temporary addresses made for the moved sites are removed.</p> : null}
                </>
            }
            action="Move back"
            destructive
            onConfirm={() => actions.recover.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't move back")) })}
        />
    );
}

/** It stopped. Say what happened, what is safe, and what the owner can do. */
export function ProblemPanel({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const needsDecision = view.status === "RECOVERY_REQUIRED";
    const safe = view.failure?.sourceRestored !== false && !needsDecision;

    return (
        <Section>
            <Row
                leading={needsDecision ? <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" /> : undefined}
                label={view.failure?.message ?? "Something went wrong"}
                state={view.failure?.at ? formatRelativeTime(view.failure.at) : undefined}
                className={cn(!needsDecision && "text-destructive")}
            />
            {safe ? <LockedLine>Your apps are still running on {view.source.name}. Nothing there was changed.</LockedLine> : null}
            {needsDecision ? (
                <LockedLine>
                    {view.writerOwner === "target"
                        ? `${view.target.name} may already be saving data, so nothing was changed back by itself.`
                        : `Your apps may be stopped on ${view.source.name}, so nothing was changed by itself.`}
                </LockedLine>
            ) : null}
            {view.actions.canRecheck ? (
                <>
                    <LockedLine>The move itself finished: your data was copied and every database count matched. Only the last check on the new server failed. You can run that check again; nothing is copied, stopped or started.</LockedLine>
                    <Row
                        label="Run the last check again"
                        action={
                            <Button onClick={() => actions.recheck.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't check again")) })} disabled={actions.recheck.isPending}>
                                <Busy pending={actions.recheck.isPending} />
                                Check again
                            </Button>
                        }
                    />
                </>
            ) : null}
            <Row
                label={needsDecision ? "Choose how to continue" : "What next?"}
                action={
                    <span className="flex flex-wrap items-center gap-2">
                        {view.actions.canRetry ? (
                            <Button onClick={() => actions.retry.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't try again")) })} disabled={actions.retry.isPending}>
                                <Busy pending={actions.retry.isPending} />
                                Try again
                            </Button>
                        ) : null}
                        {view.actions.canRescan && !view.actions.canRetry ? (
                            <Button onClick={() => actions.rescan.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't scan again")) })} disabled={actions.rescan.isPending}>
                                <Busy pending={actions.rescan.isPending} />
                                Scan again
                            </Button>
                        ) : null}
                        {view.actions.canRecover ? <RecoverButton view={view} /> : null}
                        {view.actions.canAbort ? (
                            <Confirm
                                trigger={<Button variant="ghost">Cancel migration</Button>}
                                title="Cancel this migration?"
                                description={<p>What was created on {view.target.name} is removed. {view.source.name} is not changed.</p>}
                                action="Cancel migration"
                                onConfirm={() => actions.abort.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't cancel")) })}
                            />
                        ) : null}
                    </span>
                }
            />
        </Section>
    );
}

/**
 * What Opslin made on the new server and has not removed yet: the stopped copy after moving back, or what a cancel
 * could not take away (for example because the new server was offline at the time). The action is the same one.
 */
function CopyRows({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    return (
        <>
            {view.copy === "kept" ? (
                <Row
                    label={view.status === "ABORTED"
                        ? `Part of the practice copy is still on ${view.target.name}`
                        : `A stopped copy of your apps and data is still on ${view.target.name}`}
                    action={
                        <Confirm
                            trigger={<Button variant="outline" disabled={!view.actions.canClearCopy || actions.clearCopy.isPending}><Busy pending={actions.clearCopy.isPending} />Remove the copy</Button>}
                            title={`Remove the copy from ${view.target.name}?`}
                            description={
                                <>
                                    <p>The containers, volumes and networks Opslin made there for this migration are deleted, including the data in them.</p>
                                    <p>{view.source.name} is not touched. Real folders on {view.target.name} are never deleted.</p>
                                </>
                            }
                            action="Remove the copy"
                            destructive
                            onConfirm={() => actions.clearCopy.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't remove the copy")) })}
                        />
                    }
                />
            ) : null}
            {view.copy === "removing" ? <Row leading={<Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />} label={`Removing the copy from ${view.target.name}`} state="Working" /> : null}
            {view.copy === "removed" ? <Row leading={<Check className="size-4" aria-hidden="true" />} label={`The copy was removed from ${view.target.name}`} /> : null}
        </>
    );
}

function KeptFolders({ view }: { view: MigrationView }) {
    if (view.keptFolders.length === 0) return null;
    return (
        <Disclosure label={`Folders left on ${view.target.name}`}>
            <div className="space-y-2 px-5 pb-4 pl-10 text-sm">
                <ul className="space-y-1">
                    {view.keptFolders.map((f) => (
                        <li key={f} className="font-mono text-xs">{f}</li>
                    ))}
                </ul>
                <p className="text-muted-foreground">
                    Opslin never deletes real folders. Before you try again, move them aside on {view.target.name}, for example:{" "}
                    <code className="font-mono text-xs">sudo mv {view.keptFolders[0]} {view.keptFolders[0]}.old</code>
                </p>
            </div>
        </Disclosure>
    );
}

/** Over: accepted, cancelled or moved back. */
export function FinishedPanel({ view }: { view: MigrationView }) {
    const accepted = view.status === "ACCEPTED" || view.status === "CUTOVER_DONE";
    const text = accepted
        ? `Now running on ${view.target.name}. ${view.source.name} was left as it is; remove it yourself when you're ready.`
        : view.status === "ROLLED_BACK"
          ? `Your apps are running on ${view.source.name} again.`
          : `Nothing on ${view.source.name} was changed.`;
    return (
        <Section>
            <Row leading={accepted ? <Check className="size-4" aria-hidden="true" /> : <Lock className="size-4 text-muted-foreground" aria-hidden="true" />} label={text} state={formatRelativeTime(view.updatedAt)} />
            {view.copy ? <CopyRows view={view} /> : null}
            {accepted ? <MovedApps view={view} showChecks={false} /> : null}
            <Row
                label="Move something else?"
                action={
                    <Button asChild variant="outline">
                        <Link href="/migrations">Start another migration</Link>
                    </Button>
                }
            />
            {!accepted ? <KeptFolders view={view} /> : null}
        </Section>
    );
}
