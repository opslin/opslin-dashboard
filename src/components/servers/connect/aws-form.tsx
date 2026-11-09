"use client";

import { useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type AwsInstallInput, type AwsMethod, type AwsTestResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PreflightList, type SshStart } from "./ssh-form";
import { ConnectStepper, errorText, isSshUnavailable } from "./shared";

const REGIONS = ["us-east-1", "us-east-2", "us-west-2", "eu-west-1", "eu-central-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"];

const METHODS: { value: AwsMethod; title: string; detail: string }[] = [
    { value: "instance-connect", title: "Temporary key (EC2 Instance Connect)", detail: "Needs a public IP and port 22 open. Works on Ubuntu 20.04+ and Amazon Linux." },
    { value: "ssm", title: "Session Manager", detail: "No SSH and no open port. Needs the SSM Agent and a role with AmazonSSMManagedInstanceCore." },
];

export function AwsForm({ onBack, onStarted, onUseCommand }: { onBack: () => void; onStarted: (start: SshStart) => void; onUseCommand: () => void }) {
    const [accessKeyId, setAccessKeyId] = useState("");
    const [secretAccessKey, setSecretAccessKey] = useState("");
    const [sessionToken, setSessionToken] = useState("");
    const [region, setRegion] = useState("ap-south-1");
    const [instanceId, setInstanceId] = useState("");
    const [method, setMethod] = useState<AwsMethod>("instance-connect");
    const [osUser, setOsUser] = useState("ubuntu");
    const [testing, setTesting] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [test, setTest] = useState<AwsTestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [policy, setPolicy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const ready = accessKeyId.trim().length > 0 && secretAccessKey.trim().length > 0 && region.trim().length > 0 && instanceId.trim().length > 0;
    const input = (): AwsInstallInput => ({
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        ...(sessionToken.trim() ? { sessionToken: sessionToken.trim() } : {}),
        region: region.trim(),
        instanceId: instanceId.trim(),
        method,
        ...(method === "instance-connect" ? { osUser: osUser.trim() || "ubuntu" } : {}),
    });
    const reset = () => {
        setTest(null);
        setError(null);
    };
    const fail = (err: unknown, fallback: string) => {
        if (isSshUnavailable(err)) setUnavailable(true);
        else setError(errorText(err, fallback));
    };

    const showPolicy = async () => {
        try {
            setPolicy(JSON.stringify(await api.getAwsPolicy(method, instanceId.trim() || undefined), null, 2));
        } catch (err) {
            fail(err, "Couldn't load the policy.");
        }
    };
    const copyPolicy = async () => {
        if (!policy) return;
        try {
            await navigator.clipboard.writeText(policy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* the policy stays visible */
        }
    };

    const runTest = async () => {
        reset();
        setTesting(true);
        try {
            setTest(await api.testAws(input()));
        } catch (err) {
            fail(err, "We couldn't check that instance. Try again.");
        } finally {
            setTesting(false);
        }
    };
    const runInstall = async () => {
        setError(null);
        setInstalling(true);
        try {
            const { jobId } = await api.installAws(input());
            onStarted({ jobId, host: instanceId.trim(), username: "aws", test, kind: "add" });
        } catch (err) {
            fail(err, "Couldn't start the install. Please try again.");
            setInstalling(false);
        }
    };

    return (
        <div className="space-y-8">
            <ConnectStepper step={2} />
            <div className="space-y-3 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Connect with your AWS account</h1>
                <p className="text-lg text-muted-foreground">No key file. Use a throw-away IAM user with the small policy below.</p>
            </div>

            <Card className="mx-auto max-w-2xl gap-0 py-0">
                <CardContent className="space-y-5 p-6">
                    <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Back
                    </button>

                    <div role="radiogroup" aria-label="How Opslin reaches the instance" className="space-y-2">
                        {METHODS.map((option) => (
                            <button key={option.value} type="button" role="radio" aria-checked={method === option.value} onClick={() => { setMethod(option.value); setPolicy(null); reset(); }} className={cn("w-full rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring", method === option.value ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40")}>
                                <span className="block text-sm font-medium text-foreground">{option.title}</span>
                                <span className="block text-sm text-muted-foreground">{option.detail}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="aws-region">Region</Label>
                            <Input id="aws-region" list="aws-regions" value={region} autoComplete="off" onChange={(e) => { setRegion(e.target.value); reset(); }} />
                            <datalist id="aws-regions">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="aws-instance">Instance ID</Label>
                            <Input id="aws-instance" value={instanceId} placeholder="i-0123456789abcdef0" autoComplete="off" onChange={(e) => { setInstanceId(e.target.value); setPolicy(null); reset(); }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="aws-key-id">Access key ID</Label>
                            <Input id="aws-key-id" value={accessKeyId} placeholder="AKIA…" autoComplete="off" onChange={(e) => { setAccessKeyId(e.target.value); reset(); }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="aws-secret">Secret access key</Label>
                            <Input id="aws-secret" type="password" value={secretAccessKey} autoComplete="off" onChange={(e) => { setSecretAccessKey(e.target.value); reset(); }} />
                        </div>
                        {method === "instance-connect" ? (
                            <div className="space-y-1.5">
                                <Label htmlFor="aws-user">Server username</Label>
                                <Input id="aws-user" value={osUser} autoComplete="off" onChange={(e) => { setOsUser(e.target.value); reset(); }} />
                            </div>
                        ) : null}
                    </div>
                    <details className="rounded-lg border px-4 py-3 text-sm">
                        <summary className="cursor-pointer font-medium text-foreground">Session token (only for temporary keys)</summary>
                        <Input aria-label="Session token" className="mt-2" type="password" value={sessionToken} autoComplete="off" onChange={(e) => { setSessionToken(e.target.value); reset(); }} />
                    </details>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="size-3" aria-hidden="true" />
                        Used for this one install and never stored. Delete the IAM user afterwards.
                    </p>

                    <div className="space-y-2">
                        {policy ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">Policy for the IAM user</span>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => void copyPolicy()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
                                </div>
                                <pre data-testid="aws-policy" className="max-h-56 overflow-auto rounded-xl bg-muted p-3 font-mono text-xs text-foreground">{policy}</pre>
                            </>
                        ) : (
                            <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => void showPolicy()}>Show the policy to give the IAM user</button>
                        )}
                    </div>

                    <Button type="button" variant="dark" className="w-full" disabled={!ready || testing || installing} onClick={() => void runTest()}>
                        {testing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                        {testing ? "Checking..." : "Check the instance"}
                    </Button>

                    {test?.ok ? (
                        <div role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                            <p className="font-semibold text-success-text">{test.instance?.name ?? test.instance?.id} is ready</p>
                            <p className="text-muted-foreground">{test.message ?? [test.os, test.instance?.publicIp].filter(Boolean).join(" · ")}</p>
                        </div>
                    ) : null}
                    {test && !test.ok && test.message ? (
                        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-danger-text">
                            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                            <p>{test.message}</p>
                        </div>
                    ) : null}
                    {test?.checks?.length ? <PreflightList checks={test.checks} /> : null}
                    {error ? (
                        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-danger-text">
                            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                            <p>{error}</p>
                        </div>
                    ) : null}
                    {unavailable ? (
                        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                            Connecting with an AWS account isn&apos;t available on this workspace yet.{" "}
                            <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={onUseCommand}>Use the one-command method instead</button>
                        </div>
                    ) : null}
                    {test?.ok ? (
                        <Button type="button" className="w-full" disabled={installing} onClick={() => void runInstall()}>
                            {installing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                            Install and connect
                        </Button>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
