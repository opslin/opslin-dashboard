"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleX, ExternalLink, Eye, EyeOff, FileKey, Loader2, Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type SshAuth, type SshConnectInput, type SshGeneratedKey, type SshKeyInspection, type SshPreflightCheck, type SshTestResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConnectStepper, errorText, isSshUnavailable, PROVIDERS, ProviderTile, RichStep, type ProviderId } from "./shared";

type AuthMode = "password" | "key" | "generated";

const AUTH_OPTIONS: { value: AuthMode; label: string }[] = [
    { value: "password", label: "Password" },
    { value: "key", label: "SSH key" },
    { value: "generated", label: "Create a key for me" },
];

export interface SshStart {
    jobId: string;
    host: string;
    username: string;
    test: SshTestResult | null;
    kind?: "add" | "repair" | "cleanup";
    /** The server's name, when reconnecting one that already exists. */
    name?: string;
}

const KEY_FORMAT_LABEL: Record<string, string> = { openssh: "OpenSSH", pem: "PEM", ppk2: "PuTTY" };

/** The pre-flight list: what is fine, what is worth knowing, what stops the install. One quiet row each. */
export function PreflightList({ checks }: { checks: SshPreflightCheck[] }) {
    return (
        <ul aria-label="Server checks" className="divide-y rounded-xl border text-sm">
            {checks.map((check) => (
                <li key={check.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                        {check.status === "ok" ? <CheckCircle2 className="size-4 text-success-text" /> : check.status === "warn" ? <TriangleAlert className="size-4 text-warning-text" /> : <CircleX className="size-4 text-danger-text" />}
                    </span>
                    <span className="min-w-0">
                        <span className="font-medium text-foreground">{check.title}</span>
                        <span className="sr-only">{check.status === "ok" ? ", fine" : check.status === "warn" ? ", worth knowing" : ", stops the install"}</span>
                        <span className="block text-muted-foreground">{check.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

function describeServer(result: SshTestResult) {
    const parts = [result.os, result.cpuCores ? `${result.cpuCores} vCPU` : null, result.memoryMb ? `${Math.round(result.memoryMb / 1024)} GB RAM` : null].filter(Boolean);
    return parts.join(", ");
}

function HelpPanel({ providerId, onProvider, onUseCommand }: { providerId: ProviderId; onProvider: (id: ProviderId) => void; onUseCommand: () => void }) {
    const provider = PROVIDERS.find((entry) => entry.id === providerId) ?? PROVIDERS[0];
    return (
        <Card className="gap-0 py-0">
            <CardContent className="space-y-5 p-6">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-foreground">Where do I find this?</h2>
                    <Select value={providerId} onValueChange={(value) => onProvider(value as ProviderId)}>
                        <SelectTrigger className="w-44" aria-label="Your provider">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PROVIDERS.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>
                                    <span className="flex items-center gap-2">
                                        <ProviderTile provider={entry} className="size-5 text-[10px]" />
                                        {entry.label}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <ol className="space-y-3">
                    {provider.steps.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                            <span className="pt-0.5">
                                <RichStep text={step} />
                            </span>
                        </li>
                    ))}
                </ol>
                {provider.consoleUrl ? (
                    <Button asChild variant="outline" className="w-full">
                        <a href={provider.consoleUrl} target="_blank" rel="noreferrer">
                            {provider.consoleLabel}
                            <ExternalLink aria-hidden="true" />
                        </a>
                    </Button>
                ) : null}
                <p className="border-t pt-4 text-sm text-muted-foreground">
                    Prefer not to type a password?{" "}
                    <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={onUseCommand}>
                        Use the one-command method
                    </button>
                </p>
            </CardContent>
        </Card>
    );
}

export function SshForm({ onBack, onStarted, onUseCommand, repair }: { onBack: () => void; onStarted: (start: SshStart) => void; onUseCommand: () => void; repair?: { serverId: string; name: string } }) {
    const [providerId, setProviderId] = useState<ProviderId>("hostinger");
    const [host, setHost] = useState("");
    const [username, setUsername] = useState("root");
    const [port, setPort] = useState("22");
    const [mode, setMode] = useState<AuthMode>("password");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [privateKey, setPrivateKey] = useState("");
    const [passphrase, setPassphrase] = useState("");
    const [wantsPassphrase, setWantsPassphrase] = useState(false);
    const [keyInfo, setKeyInfo] = useState<SshKeyInspection | null>(null);
    const [keyFileName, setKeyFileName] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [sudoPassword, setSudoPassword] = useState("");
    const [generated, setGenerated] = useState<SshGeneratedKey | null>(null);
    const [testing, setTesting] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [test, setTest] = useState<SshTestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const result = test?.ok ? test : null;
    const portNumber = Number(port);
    const portValid = Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536;
    const keyUsable = privateKey.trim().length > 0 && (keyInfo === null || keyInfo.ok || (keyInfo.encrypted && passphrase.length === 0 && keyInfo.format !== "ppk3"));
    const authReady = mode === "password" ? password.length > 0 : mode === "key" ? keyUsable : generated !== null;
    const canSubmit = host.trim().length > 0 && username.trim().length > 0 && portValid && authReady;
    const busy = testing || installing;
    const showPassphrase = wantsPassphrase || passphrase.length > 0 || Boolean(keyInfo?.encrypted);

    const resetResult = () => {
        setTest(null);
        setError(null);
        setUnavailable(false);
        setConfirmRemove(false);
    };

    // What kind of key is this, and does it need a passphrase? Asked as soon as a file is chosen or text is pasted.
    useEffect(() => {
        if (mode !== "key" || privateKey.trim().length === 0) {
            setKeyInfo(null);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            api.inspectSshKey(privateKey, passphrase || undefined)
                .then((info) => !cancelled && setKeyInfo(info))
                .catch(() => !cancelled && setKeyInfo(null));
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [mode, privateKey, passphrase]);

    const chooseProvider = (id: ProviderId) => {
        setProviderId(id);
        const provider = PROVIDERS.find((entry) => entry.id === id);
        if (!provider) return;
        // The login name and the usual way in for that provider: AWS and Oracle give a key file, not a password.
        if (!provider.usernameHint.includes(" ")) setUsername(provider.usernameHint);
        if (provider.keyOnly) setMode("key");
        resetResult();
    };

    const buildInput = (): SshConnectInput => {
        let auth: SshAuth;
        if (mode === "password") auth = { type: "password", password };
        else if (mode === "key") auth = { type: "key", privateKey, ...(passphrase ? { passphrase } : {}) };
        else auth = { type: "generated", keyId: generated?.keyId ?? "" };
        return {
            host: host.trim(),
            port: portNumber,
            username: username.trim(),
            auth,
            ...(sudoPassword ? { sudoPassword } : {}),
            ...(repair ? { mode: "repair" as const, serverId: repair.serverId } : {}),
        };
    };

    const handleFailure = (err: unknown, fallback: string) => {
        if (isSshUnavailable(err)) {
            setUnavailable(true);
            setError(null);
        } else {
            setError(errorText(err, fallback));
        }
    };

    const loadKeyFile = async (file: File | undefined) => {
        if (!file) return;
        resetResult();
        if (file.size > 20_000) {
            setKeyInfo({ ok: false, format: "unknown", encrypted: false, type: null, message: "That file is too large to be a key. Choose the .pem or .ppk file your provider gave you." });
            setPrivateKey("");
            setKeyFileName(null);
            return;
        }
        // Read in the browser and put it in the box. The file itself is never uploaded or kept.
        setPrivateKey(await file.text());
        setKeyFileName(file.name);
        setMode("key");
    };

    const createKey = async () => {
        setError(null);
        try {
            setGenerated(await api.createSshKey());
            resetResult();
        } catch (err) {
            handleFailure(err, "Couldn't create a key. Please try again.");
        }
    };

    const runTest = async () => {
        resetResult();
        setTesting(true);
        try {
            const response = await api.testSshConnection(buildInput());
            setTest(response);
            if (!response.ok && !response.checks && !response.needsSudoPassword) setError(response.message || "We couldn't log in. Check the IP, username and password.");
        } catch (err) {
            handleFailure(err, "We couldn't reach that server. Check the IP address and port.");
        } finally {
            setTesting(false);
        }
    };

    const runInstall = async () => {
        setError(null);
        setInstalling(true);
        try {
            const { jobId } = await api.startSshInstall({ ...buildInput(), ...(result?.hostKey ? { hostKey: result.hostKey } : {}) });
            onStarted({ jobId, host: host.trim(), username: username.trim(), test: result, kind: repair ? "repair" : "add", name: repair?.name });
        } catch (err) {
            handleFailure(err, "Couldn't start the install. Please try again.");
            setInstalling(false);
        }
    };

    const runRemove = async () => {
        setError(null);
        setInstalling(true);
        try {
            const { jobId } = await api.startSshCleanup({ ...buildInput(), ...(test?.hostKey ? { hostKey: test.hostKey } : {}), confirm: true });
            onStarted({ jobId, host: host.trim(), username: username.trim(), test, kind: "cleanup" });
        } catch (err) {
            handleFailure(err, "Couldn't start the removal. Please try again.");
            setInstalling(false);
        }
    };

    const copyKey = async () => {
        if (!generated) return;
        try {
            await navigator.clipboard.writeText(generated.publicKey);
        } catch {
            /* the key stays visible for manual copy */
        }
    };

    const keyTone = keyInfo && !keyInfo.ok && !keyInfo.encrypted ? "text-danger-text" : "text-muted-foreground";

    return (
        <div className="space-y-8">
            <ConnectStepper step={2} />
            <div className="space-y-3 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">{repair ? `Reconnect ${repair.name}` : "Connect your server"}</h1>
                <p className="text-lg text-muted-foreground">{repair ? "Log in once. Opslin repairs the agent and keeps your apps and settings." : "Enter your server's login. Opslin installs everything for you."}</p>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <Card className="gap-0 py-0">
                    <CardContent className="space-y-5 p-6">
                        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Back
                        </button>

                        <div className="space-y-1.5">
                            <Label htmlFor="ssh-host">Server IP address</Label>
                            <Input id="ssh-host" value={host} placeholder="203.0.113.10" autoComplete="off" inputMode="decimal" onChange={(event) => { setHost(event.target.value); resetResult(); }} />
                            <p className="text-xs text-muted-foreground">Shown on your provider&apos;s dashboard</p>
                        </div>

                        <div className="grid grid-cols-[1fr_7rem] gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="ssh-user">Username</Label>
                                <Input id="ssh-user" value={username} autoComplete="off" onChange={(event) => { setUsername(event.target.value); resetResult(); }} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ssh-port">SSH port</Label>
                                <Input id="ssh-port" value={port} inputMode="numeric" aria-invalid={!portValid} onChange={(event) => { setPort(event.target.value); resetResult(); }} />
                            </div>
                            <p className="col-span-2 -mt-2 text-xs text-muted-foreground">Most servers use root and port 22. AWS uses ubuntu, Oracle uses opc.</p>
                        </div>

                        <div className="space-y-1.5">
                            <span id="ssh-auth-label" className="text-sm font-medium text-foreground">How do you log in?</span>
                            <div role="radiogroup" aria-labelledby="ssh-auth-label" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                                {AUTH_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={mode === option.value}
                                        onClick={() => { setMode(option.value); resetResult(); }}
                                        className={cn(
                                            "whitespace-nowrap rounded-md px-1 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                            mode === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {mode === "password" ? (
                            <div className="space-y-1.5">
                                <Label htmlFor="ssh-password">Password</Label>
                                <div className="relative">
                                    <Input id="ssh-password" type={showPassword ? "text" : "password"} value={password} autoComplete="off" className="pr-10" onChange={(event) => { setPassword(event.target.value); resetResult(); }} />
                                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                                        {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                                    </button>
                                </div>
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Lock className="size-3" aria-hidden="true" />
                                    Used once to install Opslin. We never store it.
                                </p>
                            </div>
                        ) : null}

                        {mode === "key" ? (
                            <div className="space-y-3">
                                <div
                                    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={(event) => { event.preventDefault(); setDragging(false); void loadKeyFile(event.dataTransfer.files?.[0]); }}
                                    className={cn("space-y-3 rounded-xl border border-dashed p-3 transition-colors", dragging ? "border-primary bg-primary/5" : "border-border")}
                                >
                                    <div className="flex flex-wrap items-center gap-3">
                                        <input ref={fileInput} type="file" className="sr-only" aria-label="Key file" tabIndex={-1} onChange={(event) => { void loadKeyFile(event.target.files?.[0]); event.target.value = ""; }} />
                                        <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                                            <FileKey aria-hidden="true" />
                                            Choose key file
                                        </Button>
                                        <span className="min-w-0 truncate text-sm text-muted-foreground">{keyFileName ?? "Your .pem or .ppk file. You can also drop it here."}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ssh-key">Private key</Label>
                                        <Textarea id="ssh-key" rows={5} value={privateKey} spellCheck={false} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className="font-mono text-xs" onChange={(event) => { setPrivateKey(event.target.value); setKeyFileName(null); resetResult(); }} />
                                    </div>
                                </div>
                                {keyInfo?.message ? <p role={keyInfo.ok || keyInfo.encrypted ? "status" : "alert"} className={cn("text-sm", keyTone)}>{keyInfo.message}</p> : null}
                                {keyInfo?.ok ? <p className="flex items-center gap-1.5 text-sm text-success-text"><CheckCircle2 className="size-4" aria-hidden="true" />{KEY_FORMAT_LABEL[keyInfo.format] ?? "Private"} key{keyInfo.type ? `, ${keyInfo.type.replace(/^ssh-/, "")}` : ""}</p> : null}
                                {showPassphrase ? (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ssh-passphrase">Key passphrase</Label>
                                        <Input id="ssh-passphrase" type="password" value={passphrase} autoComplete="off" onChange={(event) => { setPassphrase(event.target.value); resetResult(); }} />
                                    </div>
                                ) : (
                                    <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setWantsPassphrase(true)}>This key has a passphrase</button>
                                )}
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Lock className="size-3" aria-hidden="true" />
                                    Read in your browser and used once to install Opslin. We never store it.
                                </p>
                            </div>
                        ) : null}

                        {mode === "generated" ? (
                            <div className="space-y-3">
                                {generated ? (
                                    <>
                                        <p className="text-sm text-muted-foreground">Add this public key to your server&apos;s <code className="rounded bg-muted px-1">~/.ssh/authorized_keys</code>, then test the connection.</p>
                                        <Textarea readOnly rows={3} value={generated.publicKey} aria-label="Public key" className="font-mono text-xs" />
                                        <Button type="button" variant="outline" size="sm" onClick={() => void copyKey()}>Copy public key</Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-muted-foreground">Opslin creates a key pair for this server. You only add the public half to your server.</p>
                                        <Button type="button" variant="outline" onClick={() => void createKey()}>Create a key for me</Button>
                                    </>
                                )}
                            </div>
                        ) : null}

                        {test?.needsSudoPassword ? (
                            <div className="space-y-1.5">
                                <Label htmlFor="ssh-sudo">Password for sudo</Label>
                                <Input id="ssh-sudo" type="password" value={sudoPassword} autoComplete="off" onChange={(event) => { setSudoPassword(event.target.value); }} />
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Lock className="size-3" aria-hidden="true" />
                                    This server asks for a password to run admin commands. Used once, never stored.
                                </p>
                            </div>
                        ) : null}

                        <details className="group rounded-lg border px-4 py-3 text-sm">
                            <summary className="cursor-pointer font-medium text-foreground">What gets installed?</summary>
                            <p className="mt-2 text-muted-foreground">Docker (if missing) and the Opslin agent, which connects back to Opslin over a secure outbound connection. Nothing else is changed.</p>
                        </details>

                        <Button type="button" variant="dark" className="w-full" disabled={!canSubmit || busy} onClick={() => void runTest()}>
                            {testing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                            {testing ? "Testing..." : "Test connection"}
                        </Button>

                        {result ? (
                            <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-text" aria-hidden="true" />
                                <div>
                                    <p className="font-semibold text-success-text">Connected to {host.trim()} as {username.trim()}</p>
                                    {describeServer(result) ? <p className="text-muted-foreground">{describeServer(result)}</p> : null}
                                </div>
                            </div>
                        ) : null}

                        {test && !test.ok && test.message ? (
                            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-danger-text">
                                <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                                <p>{test.message}</p>
                            </div>
                        ) : null}

                        {test?.checks?.length ? <PreflightList checks={test.checks} /> : null}

                        {test?.agentPresent && !repair ? (
                            <div className="space-y-2 rounded-xl bg-muted px-4 py-3 text-sm">
                                {confirmRemove ? (
                                    <>
                                        <p className="text-foreground">This stops and removes the Opslin agent. Your Docker containers and data stay.</p>
                                        <div className="flex gap-2">
                                            <Button type="button" size="sm" variant="destructive" disabled={installing} onClick={() => void runRemove()}>Remove the agent</Button>
                                            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                                        </div>
                                    </>
                                ) : (
                                    <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setConfirmRemove(true)}>Remove the Opslin agent from this server</button>
                                )}
                            </div>
                        ) : null}

                        {error ? (
                            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-danger-text">
                                <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                                <p>{error}</p>
                            </div>
                        ) : null}

                        {unavailable ? (
                            <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                                One-click install isn&apos;t available on this workspace yet.{" "}
                                <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={onUseCommand}>
                                    Use the one-command method instead
                                </button>
                            </div>
                        ) : null}

                        {result ? (
                            <Button type="button" className="w-full" disabled={installing} onClick={() => void runInstall()}>
                                {installing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                {repair ? "Repair and reconnect" : "Install and connect"}
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>

                <HelpPanel providerId={providerId} onProvider={chooseProvider} onUseCommand={onUseCommand} />
            </div>
        </div>
    );
}
