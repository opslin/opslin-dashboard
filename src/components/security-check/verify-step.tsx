"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Disclosure, Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "./rows";
import { Button } from "@/components/ui/button";
import type { SecurityCheckTarget } from "@/lib/api";
import { errorMessage, useSecurityCheckActions } from "./use-security-check";

/** Older route for browsers and embedded views that refuse the clipboard API (no permission, or not a secure page). */
function copyWithSelection(value: string): boolean {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, value.length);
    try {
        return document.execCommand("copy");
    } catch {
        return false;
    } finally {
        document.body.removeChild(field);
    }
}

function CopyValue({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        let ok = false;
        try {
            await navigator.clipboard.writeText(value);
            ok = true;
        } catch {
            ok = copyWithSelection(value);
        }
        if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } else {
            toast.error("Couldn't copy. Select the text and copy it by hand.");
        }
    };
    return (
        <Row
            label={<span className="text-muted-foreground">{label}</span>}
            state={<code className="max-w-[18rem] truncate font-mono text-xs text-foreground sm:max-w-[26rem]" title={value}>{value}</code>}
            action={
                <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
            }
        />
    );
}

/** Step 2: show the proof to publish and check it. */
export function VerifyStep({ target, onBack }: { target: SecurityCheckTarget; onBack: () => void }) {
    const { verify, remove } = useSecurityCheckActions();
    const [reasons, setReasons] = useState<{ dns: string; http: string } | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const challenge = target.challenge;

    const check = async () => {
        setFailure(null);
        try {
            const result = await verify.mutateAsync(target.id);
            if (!result.verified) setReasons({ dns: result.dns, http: result.http });
            else setReasons(null);
        } catch (e) {
            setReasons(null);
            setFailure(errorMessage(e, "Couldn't check right now."));
        }
    };

    if (!challenge) return null;

    return (
        <Panel>
            <Section label={`Prove you control ${target.hostname}`}>
                <Row label="Add this DNS record at your domain provider" />
                <CopyValue label="Type" value="TXT" />
                <CopyValue label="Name" value={challenge.dns.name} />
                <CopyValue label="Value" value={challenge.dns.value} />
                <Row label={<span className="text-sm font-normal text-muted-foreground">If your provider adds the domain for you, enter only _opslin-verify as the name.</span>} />
            </Section>
            <Disclosure label="Use a file on your website instead">
                <div className="divide-y divide-border/70 border-t border-border/70">
                    <CopyValue label="Address" value={challenge.http.url} />
                    <CopyValue label="File contents" value={challenge.http.body} />
                </div>
            </Disclosure>
            <Section>
                <Row
                    label={
                        reasons || failure || target.lastVerifyError ? (
                            <span className="text-sm font-normal text-muted-foreground" role="status">
                                {failure ?? (reasons ? `${reasons.dns}${reasons.http ? ` File check: ${reasons.http}` : ""}` : target.lastVerifyError)}
                            </span>
                        ) : (
                            <span className="text-sm font-normal text-muted-foreground">DNS changes can take a few minutes to appear.</span>
                        )
                    }
                    action={
                        <Button onClick={check} disabled={verify.isPending}>
                            {verify.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                            Check now
                        </Button>
                    }
                />
            </Section>
            <Section>
                <Row
                    label={<span className="text-sm font-normal text-muted-foreground">Wrong domain?</span>}
                    action={
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={async () => {
                                try {
                                    await remove.mutateAsync(target.id);
                                    onBack();
                                } catch (e) {
                                    toast.error(errorMessage(e, "Couldn't remove that domain."));
                                }
                            }}
                        >
                            Remove domain
                        </Button>
                    }
                />
            </Section>
        </Panel>
    );
}
