import type { EnvVar } from "@/components/ui/env-vars-editor";

export const MASKED_ENV_VALUE = "********";

export function isSecretLikeKey(key: string) {
    return /secret|password|token|key/i.test(key);
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
