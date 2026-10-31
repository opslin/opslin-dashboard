/** Mirrors opslin-api lib/insights/deploy-profile.ts InsightsSummary. */
export interface InsightsGroup {
    key: string;
    total: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
    avgDurationMs: number | null;
}

export interface DeployInsights {
    rangeDays: number;
    total: number;
    succeeded: number;
    failed: number;
    aborted: number;
    successRate: number | null;
    retried: number;
    withDatabase: number;
    aiCalls: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    byStack: InsightsGroup[];
    byPath: InsightsGroup[];
    byRam: InsightsGroup[];
    failureClasses: Array<{ key: string; count: number }>;
    daily: Array<{ day: string; total: number; failed: number }>;
}
