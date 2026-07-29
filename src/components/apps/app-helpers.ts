import type { App, AppDomainRecord, AppDomainsResponse, DeploymentRecord } from "@/lib/api";

type AppServerAddress = {
    ip?: string | null;
    publicIp?: string | null;
    hostname?: string | null;
};

function stripPort(host: string) {
    if (host.startsWith("[") && host.includes("]")) {
        return host.slice(1, host.indexOf("]"));
    }
    return host.split(":")[0];
}

function isRawIpHost(host?: string | null) {
    if (!host) {
        return false;
    }

    const normalized = stripPort(host.trim().toLowerCase());
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
        return normalized.split(".").every((part) => {
            const value = Number(part);
            return Number.isInteger(value) && value >= 0 && value <= 255;
        });
    }

    return /^[0-9a-f:]+$/i.test(normalized) && normalized.includes(":");
}

function urlHost(value: string) {
    try {
        return new URL(value).hostname;
    } catch {
        return value.replace(/^https?:\/\//i, "").split("/")[0];
    }
}

function safeDomainUrl(url?: string | null) {
    if (!url || isRawIpHost(urlHost(url))) {
        return null;
    }
    return url;
}

function domainCanBeShown(domain: AppDomainRecord) {
    return !isRawIpHost(domain.domain);
}

export function deploymentBadgeClass(status: DeploymentRecord["status"]) {
    switch (status) {
        case "succeeded":
            return "bg-emerald-100 text-emerald-700";
        case "running":
            return "bg-sky-100 text-sky-700";
        case "pending":
            return "bg-amber-100 text-amber-700";
        case "rolled_back":
            return "bg-indigo-100 text-indigo-700";
        case "aborted":
            return "bg-orange-100 text-orange-700";
        case "failed":
            return "bg-red-100 text-red-700";
    }
}

export function formatDeploymentStatus(status: DeploymentRecord["status"]) {
    return status.replace("_", " ").toUpperCase();
}

export function shortSha(sha: string) {
    return sha.slice(0, 7);
}

export function isLocalServerAddress(value?: string | null) {
    if (!value) {
        return true;
    }
    return value === "localhost" ||
        value === "::1" ||
        value === "0.0.0.0" ||
        value.startsWith("127.");
}

export function appAccessUrl(app: App, server: AppServerAddress) {
    if (app.domain && !isRawIpHost(app.domain)) {
        return {
            url: `http://${app.domain}`,
            label: app.domain,
            scope: "Legacy public domain",
            help: "Opslin now opens app URLs through managed domains. HTTPS is used only after SSL is active.",
        };
    }

    if (app.port && isLocalServerAddress(server.ip) && !server.publicIp) {
        const host = server.publicIp || (isLocalServerAddress(server.ip) ? "localhost" : (server.ip || server.hostname || "localhost"));
        return {
            url: `http://${host}:${app.port}`,
            label: `Port ${app.port} on the VPS`,
            scope: isLocalServerAddress(server.ip) ? "Local preview URL" : "Private runtime port",
            help: isLocalServerAddress(server.ip)
                ? "Open this on your machine to verify the running container."
                : "Opslin binds app containers to the server loopback interface for safety. Use Nginx on port 80/443 for browser access.",
        };
    }

    return null;
}

export function appDomainUrl(domain: AppDomainRecord) {
    if (!domainCanBeShown(domain)) {
        return null;
    }

    if (domain.sslStatus === "active") {
        return safeDomainUrl(domain.preferredUrl || domain.httpsUrl || `https://${domain.domain}`);
    }

    const preferred = safeDomainUrl(domain.preferredUrl);
    if (preferred && preferred.toLowerCase().startsWith("http://")) {
        return preferred;
    }

    return safeDomainUrl(domain.httpUrl || `http://${domain.domain}`);
}

export function resolveVisibleDomain(domainData?: AppDomainsResponse) {
    if (!domainData) {
        return null;
    }

    const isVisible = (domain: AppDomainRecord) => domainCanBeShown(domain);

    const customPrimary = domainData.domains.find((domain) =>
        domain.type === "custom" &&
        domain.enabled &&
        isVisible(domain) &&
        (domain.status === "active" || domain.status === "connected")
    );
    if (customPrimary) {
        return { label: "Primary URL", domain: customPrimary };
    }

    const explicitPrimary = domainData.primaryDomain
        ? domainData.domains.find((domain) =>
            domain.domain === domainData.primaryDomain &&
            domain.enabled &&
            isVisible(domain) &&
            (domain.status === "active" || domain.status === "connected")
        )
        : null;
    if (explicitPrimary) {
        return { label: "Primary URL", domain: explicitPrimary };
    }

    const preview = domainData.previewDomain
        ? domainData.domains.find((domain) => domain.domain === domainData.previewDomain && domain.enabled && isVisible(domain))
        : domainData.domains.find((domain) => domain.type === "preview" && domain.enabled && isVisible(domain));
    if (preview) {
        return { label: "Temporary URL", domain: preview };
    }

    return null;
}

export function repoFullNameFromGitUrl(gitUrl?: string | null) {
    if (!gitUrl) {
        return null;
    }

    const normalized = gitUrl.replace(/\.git$/, "");
    const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
    if (sshMatch) {
        return `${sshMatch[1]}/${sshMatch[2]}`;
    }

    try {
        const url = new URL(normalized);
        if (url.hostname.toLowerCase() !== "github.com") {
            return null;
        }
        const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
        return owner && repo ? `${owner}/${repo}` : null;
    } catch {
        const shorthandMatch = normalized.match(/^github\.com[:/]([^/]+)\/([^/]+)$/i);
        return shorthandMatch ? `${shorthandMatch[1]}/${shorthandMatch[2]}` : null;
    }
}
