import type { EnvVar } from "@/components/ui/env-vars-editor";

export const MASKED_ENV_VALUE = "********";

export function isSecretLikeKey(key: string) {
    return /secret|password|token|key/i.test(key) || /^(?:DATABASE|DB|POSTGRES(?:QL)?|MYSQL|MONGO(?:DB)?|REDIS|BULL_REDIS)_(?:URL|URI|DSN)$/i.test(key);
}

const WEB_ADDRESS_KEYS = new Set(["FRONTEND_URL", "ADMIN_URL", "CUSTOMER_APP_URL", "APP_URL", "BASE_URL", "SITE_URL", "SITE_ROOT", "PUBLIC_URL", "NEXT_PUBLIC_APP_URL"]);

/** Known web-address settings need a scheme. Connection strings and arbitrary application settings are left alone. */
export function invalidWebAddressKeys(vars: EnvVar[]) {
    return vars.filter(({ key, value }) => {
        if (!WEB_ADDRESS_KEYS.has(key) || !value.trim() || value === "{{opslin.app_url}}") return false;
        try {
            const url = new URL(value);
            return !["http:", "https:"].includes(url.protocol) || !url.hostname;
        } catch { return true; }
    }).map(({ key }) => key);
}

export function maskEnvVarList(vars: EnvVar[]) {
    return vars.map((envVar) => {
        const isSecret = envVar.isSecret || isSecretLikeKey(envVar.key);
        return {
            ...envVar,
            isSecret,
            value: isSecret ? MASKED_ENV_VALUE : envVar.value,
        };
    });
}

export function envRecordToMaskedList(envVars?: Record<string, string> | null): EnvVar[] {
    return Object.entries(envVars ?? {}).map(([key, value]) => {
        const isSecret = isSecretLikeKey(key);
        return {
            key,
            value: isSecret ? MASKED_ENV_VALUE : value,
            isSecret,
        };
    });
}

export function serializeEnvVarsForSave(vars: EnvVar[], originalEnvVars?: Record<string, string> | null) {
    return vars.reduce((acc, envVar) => {
        if (!envVar.key) {
            return acc;
        }

        const isSecret = envVar.isSecret || isSecretLikeKey(envVar.key);
        acc[envVar.key] = isSecret && envVar.value === MASKED_ENV_VALUE
            ? originalEnvVars?.[envVar.key] ?? ""
            : envVar.value;
        return acc;
    }, {} as Record<string, string>);
}
