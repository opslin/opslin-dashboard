"use client";

import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

const FEATURE_LABELS: Record<string, { label: string; plan: string }> = {
    "server.terminal": { label: "Web Terminal", plan: "Starter" },
    "domains.customDomainMode": { label: "Custom Domains", plan: "Starter" },
    "deploy.safeDeploy": { label: "Safe Deploy", plan: "Starter" },
    "testing.postDeployHealth": { label: "Post-Deploy Health Checks", plan: "Pro" },
    "server.firewallControls": { label: "Firewall Controls", plan: "Starter" },
    "server.nginxConfig": { label: "Nginx Config", plan: "Starter" },
    "backups.manual": { label: "Database Backups", plan: "Starter" },
    "alerts.email": { label: "Email Alerts", plan: "Starter" },
    "alerts.webhook": { label: "Webhook Alerts", plan: "Business" },
    "team.rbac": { label: "Role-Based Access Control", plan: "Pro" },
    "logs.requestAnalytics": { label: "Request Analytics", plan: "Pro" },
    "team.sso": { label: "SSO Integration", plan: "Enterprise" },
    databases: { label: "Databases", plan: "Starter" },
    "mcp.access": { label: "AI Tool Access (MCP)", plan: "Starter" },
};

type UpgradePromptProps = {
    feature: string;
    compact?: boolean;
    idPrefix?: string;
};

export function UpgradePrompt({ feature, compact, idPrefix }: UpgradePromptProps) {
    const info = FEATURE_LABELS[feature] || { label: feature, plan: "a higher" };

    if (compact) {
        return (
            <Link id={idPrefix ? `${idPrefix}-upgrade-link` : undefined} className="upgrade-badge" href="/pricing" title={`Requires ${info.plan} plan`}>
                <LockKeyhole className="h-3.5 w-3.5" />
                {info.plan}+
            </Link>
        );
    }

    return (
        <div className="upgrade-prompt">
            <div className="upgrade-prompt-icon">
                <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="upgrade-prompt-content">
                <h4>{info.label}</h4>
                <p>Available on {info.plan} plan and above.</p>
                <Link id={idPrefix ? `${idPrefix}-upgrade-link` : undefined} href="/pricing" className="upgrade-prompt-btn">
                    Upgrade Now
                    <ArrowUpRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}
