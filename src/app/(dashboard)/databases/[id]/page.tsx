"use client";

import { Suspense, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft, CheckCircle2, Copy, Eye, EyeOff, ExternalLink,
    Loader2, Lock, MoreVertical, Pause, Play, RefreshCw, Shield,
    Trash2, Unlock, Globe, Server, Monitor, Database, Container, CircleHelp
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { APP_CONTAINER_HOST, SERVER_LOCAL_HOST, buildConnectionString } from "@/lib/db-connection";
import { DatabaseBrandIcon } from "@/components/database/database-brand-icon";

function DatabaseDetailPageContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();

    const dbId = params.id as string;
    const serverId = searchParams.get("server") || "";

    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState<string | null>(null);
    const [connectionTab, setConnectionTab] = useState<"internal" | "public">("internal");
    const [copied, setCopied] = useState<string | null>(null);

    const { data: database, isLoading } = useQuery({
        queryKey: ["database", dbId],
        queryFn: () => api.getDatabase(serverId, dbId),
        enabled: !!serverId && !!dbId,
        refetchInterval: 30_000,
    });

    const fetchPassword = useCallback(async () => {
        try {
            const result = await api.getDbPassword(serverId, dbId);
            setPassword(result.password);
            setShowPassword(true);
            return result.password;
        } catch {
            return null;
        }
    }, [serverId, dbId]);

    const copyToClipboard = useCallback(async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }, []);

    const copyField = useCallback(async (field: string, value: string) => {
        if (field === "password" && !password) {
            const pw = await fetchPassword();
            if (pw) await copyToClipboard(pw, field);
        } else {
            await copyToClipboard(value, field);
        }
    }, [password, fetchPassword, copyToClipboard]);

    const startMutation = useMutation({
        mutationFn: () => api.startDatabase(serverId, dbId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["database", dbId] }),
    });
    const stopMutation = useMutation({
        mutationFn: () => api.stopDatabase(serverId, dbId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["database", dbId] }),
    });
    const deleteMutation = useMutation({
        mutationFn: () => api.deleteDatabase(serverId, dbId),
        onSuccess: () => router.push("/databases"),
    });
    const toggleReadOnlyMutation = useMutation({
        mutationFn: (readOnly: boolean) => api.setDbReadOnly(serverId, dbId, readOnly),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["database", dbId] }),
    });

    if (isLoading || !database) {
        return (
            <div className="dashboard-page">
                <div className="flex items-center justify-center h-[60vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    const normalizedStatus = database.status.toLowerCase();
    const isRunning = normalizedStatus === "running";
    const host = connectionTab === "internal" ? APP_CONTAINER_HOST : SERVER_LOCAL_HOST;
    const connectionUrl = buildConnectionString(database, host, showPassword ? password : null, { mask: !showPassword });
    const dbTypeLabel = database.type.toLowerCase() === "postgresql" ? "PostgreSQL" :
        database.type.toLowerCase() === "mysql" ? "MySQL" :
        database.type.toLowerCase() === "mongodb" ? "MongoDB" : "Redis";
    const uptimeStr = database.createdAt ? (() => {
        const diff = Date.now() - new Date(database.createdAt).getTime();
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        return `${days}d ${hours}h ${mins}m`;
    })() : "N/A";

    const createdDate = database.createdAt
        ? new Date(database.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) + ", " + new Date(database.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "N/A";

    return (
        <div className="dashboard-page">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/databases" className="hover:text-foreground transition-colors">Databases</Link>
                <span>›</span>
                <span className="text-foreground font-medium">{database.name}</span>
            </div>

            {/* Hero Section */}
            <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <DatabaseBrandIcon engine={database.type} size={56} />
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-semibold text-foreground">{database.name}</h1>
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${isRunning ? "bg-success-muted text-success-text border border-success/30" : normalizedStatus === "stopped" ? "bg-danger-muted text-danger-text border border-danger/30" : "bg-warning-muted text-warning-text border border-warning/30"}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-success" : normalizedStatus === "stopped" ? "bg-danger" : "bg-warning"}`} />
                                    {isRunning ? "Running" : normalizedStatus === "stopped" ? "Stopped" : "Creating"}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{dbTypeLabel} • {database.exposure === "public" ? "Public" : "Internal"}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {database.readOnly && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                                <Lock className="h-3 w-3" /> Read-only
                            </span>
                        )}
                        {isRunning ? (
                            <Button size="sm" className="gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-primary-foreground/80" /> Connect
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                                {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />} Start
                            </Button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border/60"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {isRunning && (
                                    <DropdownMenuItem onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
                                        <Pause className="h-4 w-4 mr-2" /> Stop Database
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => toggleReadOnlyMutation.mutate(!database.readOnly)}>
                                    {database.readOnly ? <><Unlock className="h-4 w-4 mr-2" /> Enable Write</> : <><Lock className="h-4 w-4 mr-2" /> Set Read-Only</>}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-danger-text" onClick={() => { if (confirm("Delete this database? All data will be lost.")) deleteMutation.mutate(); }}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete Database
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="mt-5 pt-5 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Status</div>
                        <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-success" : "bg-danger"}`} />
                            <span className="text-sm font-medium text-foreground">{isRunning ? "Healthy" : "Offline"}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Uptime</div>
                        <span className="text-sm font-medium text-foreground">{uptimeStr}</span>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                        <span className="text-sm font-medium text-foreground">{createdDate}</span>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Database ID</div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-mono text-foreground truncate">db_{dbId.slice(0, 12)}</span>
                            <button onClick={() => copyToClipboard(dbId, "dbid")} className="text-muted-foreground hover:text-foreground transition-colors">
                                {copied === "dbid" ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connect to Your Database */}
            <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Connect to Your Database</h2>
                        <p className="text-sm text-muted-foreground">Use the connection details below to connect your applications and tools.</p>
                    </div>
                    <div className="flex items-center rounded-lg border border-border/60 p-0.5">
                        <button
                            onClick={() => setConnectionTab("internal")}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${connectionTab === "internal" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Internal (Private) →
                        </button>
                        <button
                            onClick={() => setConnectionTab("public")}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${connectionTab === "public" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Public (Internet)
                        </button>
                    </div>
                </div>

                {/* Info Banner */}
                <div className="rounded-lg bg-info-muted border border-info/20 p-3 mb-5 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-info-text mt-0.5 shrink-0" />
                    <div className="text-xs text-info-text">
                        <strong>Internal connections are recommended for better security and performance.</strong><br />
                        These details work inside your apps, containers, and servers on the same network.
                    </div>
                </div>

                {/* Connection Details Rows */}
                <div className="divide-y divide-border/40">
                    {/* Connection URL */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-info-muted flex items-center justify-center"><Globe className="h-4 w-4 text-info-text" /></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Connection URL</div>
                                <div className="text-[11px] text-muted-foreground">Recommended for most applications</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-muted-foreground max-w-[300px] truncate hidden sm:block">{connectionUrl || "Not available"}</code>
                            <button onClick={() => copyField("url", connectionUrl)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "url" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                            <button onClick={() => showPassword ? setShowPassword(false) : fetchPassword()} className="p-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1 text-xs text-muted-foreground">
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="hidden sm:inline">{showPassword ? "Hide" : "Show"}</span>
                            </button>
                        </div>
                    </div>

                    {/* Host */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-chart-violet/10 flex items-center justify-center"><Server className="h-4 w-4 text-chart-violet" /></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Host</div>
                                <div className="text-[11px] text-muted-foreground">Database host address</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">{host}</code>
                            <button onClick={() => copyField("host", host)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "host" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                        </div>
                    </div>

                    {/* Port */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-warning-muted flex items-center justify-center"><span className="text-warning-text text-xs font-bold">:#</span></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Port</div>
                                <div className="text-[11px] text-muted-foreground">Database port</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">{database.hostPort || "—"}</code>
                            <button onClick={() => copyField("port", String(database.hostPort || ""))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "port" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                        </div>
                    </div>

                    {/* Database Name */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-success-muted flex items-center justify-center"><Database size={16} /></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Database Name</div>
                                <div className="text-[11px] text-muted-foreground">Name of your database</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">{database.name}</code>
                            <button onClick={() => copyField("dbname", database.name)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "dbname" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                        </div>
                    </div>

                    {/* Username */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-chart-violet/10 flex items-center justify-center"><span className="text-chart-violet text-xs font-bold">@</span></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Username</div>
                                <div className="text-[11px] text-muted-foreground">Database user</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">{database.username || "—"}</code>
                            <button onClick={() => copyField("username", database.username || "")} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "username" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                        </div>
                    </div>

                    {/* Password */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-danger-muted flex items-center justify-center"><Lock className="h-4 w-4 text-danger-text" /></div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Password</div>
                                <div className="text-[11px] text-muted-foreground">Database user password</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">
                                {database.type.toLowerCase() === "redis" ? "Not required" : showPassword && password ? password : "••••••••••••••••"}
                            </code>
                            <button onClick={() => copyField("password", password || "")} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                {copied === "password" ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </button>
                            {database.type.toLowerCase() !== "redis" && (
                                <button onClick={() => showPassword ? setShowPassword(false) : fetchPassword()} className="p-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1 text-xs text-muted-foreground">
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    <span>{showPassword ? "Hide" : "Show"}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Security Note */}
                <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="h-3.5 w-3.5 text-success-text" />
                        All connections are encrypted using TLS 1.3
                    </div>
                    <a href="#" className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-1">
                        View connection guide <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            </div>

            {/* Connection Options */}
            <div className="rounded-xl border border-border/60 bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">Connection Options</h2>
                <p className="text-sm text-muted-foreground mb-5">Choose how you want to connect to this database.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Docker / Internal Apps */}
                    <div className="rounded-xl border-2 border-info/30 bg-info-muted/50 p-4 relative">
                        <div className="h-10 w-10 rounded-lg bg-info-muted flex items-center justify-center mb-3">
                            <Container size={24} />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">Docker / Internal Apps</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">Best for apps running in Docker. Use internal network for maximum performance</p>
                        <span className="mt-3 inline-block text-[10px] font-semibold text-info-text bg-info-muted px-2 py-0.5 rounded">Recommended</span>
                    </div>
                    {/* Local Development */}
                    <div className="rounded-xl border border-border/60 p-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
                            <Monitor className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">Local Development</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">Connect from your local machine using an SSH tunnel or local proxy</p>
                        <Button variant="outline" size="sm" className="mt-3 h-7 text-[11px]">View Instructions</Button>
                    </div>
                    {/* External / Public Access */}
                    <div className="rounded-xl border border-border/60 p-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
                            <Globe className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">External / Public Access</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">Connect from the internet. Secure access with IP allowlist and SSL encryption</p>
                        <Button variant="outline" size="sm" className="mt-3 h-7 text-[11px]">Enable Access</Button>
                    </div>
                </div>
            </div>

            {/* Database Credentials (Quick Copy) */}
            <div className="rounded-xl border border-border/60 bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">Database Credentials (Quick Copy)</h2>
                <p className="text-sm text-muted-foreground mb-4">All essential details in one place.</p>
                <div className="rounded-xl bg-inverse p-5 relative">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-4 right-4 h-7 text-xs gap-1.5"
                        onClick={async () => {
                            const pw = password || await fetchPassword() || "••••••••";
                            const text = `Host:      ${host}\nPort:      ${database.hostPort || "—"}\nDatabase:  ${database.name}\nUsername:  ${database.username || "—"}\nPassword:  ${pw}\nURL:       ${buildConnectionString(database, host, pw)}`;
                            await copyToClipboard(text, "all");
                        }}
                    >
                        {copied === "all" ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy All
                    </Button>
                    <pre className="font-mono text-sm text-text-on-inverse-muted leading-relaxed">
                        <span className="text-text-on-inverse-muted">Host:      </span><span className="text-text-inverse">{host}</span>{"\n"}
                        <span className="text-text-on-inverse-muted">Port:      </span><span className="text-text-inverse">{database.hostPort || "—"}</span>{"\n"}
                        <span className="text-text-on-inverse-muted">Database:  </span><span className="text-text-inverse font-semibold">{database.name}</span>{"\n"}
                        <span className="text-text-on-inverse-muted">Username:  </span><span className="text-text-inverse">{database.username || "—"}</span>{"\n"}
                        <span className="text-text-on-inverse-muted">Password:  </span><span className="text-text-inverse">{showPassword && password ? password : "••••••••••••••••••••"}</span>{"\n"}
                        <span className="text-text-on-inverse-muted">URL:       </span><span className="text-text-inverse">{connectionUrl || "Not available"}</span>
                    </pre>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    Keep your credentials secure. Do not share them publicly.
                </div>
            </div>

            {/* Help Card */}
            <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CircleHelp size={28} />
                    <div>
                        <div className="text-sm font-medium text-foreground">Need Help?</div>
                        <div className="text-xs text-muted-foreground">Read our database connection guide</div>
                    </div>
                </div>
                <a href="#" className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-1">
                    View Guide <ExternalLink className="h-3 w-3" />
                </a>
            </div>
        </div>
    );
}

export default function DatabaseDetailPage() {
    return (
        <Suspense fallback={null}>
            <DatabaseDetailPageContent />
        </Suspense>
    );
}
