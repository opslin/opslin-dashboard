"use client";

/**
 * AppSecurityPage — composition component for the security-focused app details page.
 *
 * Owns:
 * - TanStack Query fetches for ["servers"], ["app", appId], ["app-metrics", appId], plus usePlan().
 * - Stripping the legacy ?section=logs query param via router.replace on mount.
 * - Page-level error state and retry control.
 * - Composing the eight regions in fixed order under a single <main> landmark.
 *
 * MUST NOT import any of: OverviewSection, DomainsSection, EnvironmentSection,
 * LogsSection, MetricsSection, DeploymentsSection, SettingsSection, AppSectionNav,
 * ProgressModal, CinematicDeployOverlay, DeployProgressIndicator, RollbackConfirmDialog,
 * useDeploymentLive, or any deploy-progress helper.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.6, 5.7, 11.7, 12.5, 12.7,
 *              13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import { useEffect, useMemo, useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RotateCcw } from "lucide-react";

import { api, type App, type AppMetricCurrent } from "@/lib/api";
import { usePlan } from "@/hooks/usePlan";
import { appAccessUrl } from "@/components/apps/app-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  derivePlanTier,
  deriveShieldStates,
  computeSecurityScore,
  deriveSecurityStatus,
  deriveSslIndicator,
  selectNextStep,
  SECURITY_STATUS_DESCRIPTIONS,
  type AppStatus,
  type NextStep,
} from "@/lib/security";

import { AppHeaderActions } from "./AppHeaderActions";
import { SecuritySummaryCard } from "./SecuritySummaryCard";
import { ActiveBundleSection } from "./ActiveBundleSection";
import { LockedBundleSection } from "./LockedBundleSection";
import { DomainSummaryCard } from "./DomainSummaryCard";
import { EnvironmentSummaryCard } from "./EnvironmentSummaryCard";
import { MonitoringSummaryCard } from "./MonitoringSummaryCard";
import { NextStepGuidanceCard } from "./NextStepGuidanceCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppSecurityPageProps {
  appId: string;
  /** When true, hides the header region (used when embedded as a tab in the app details page). */
  embedded?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The dashboard already exposes /settings — upgrade route is registered. */
const UPGRADE_ROUTE_REGISTERED = true;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppSecurityPage({ appId, embedded = false }: AppSecurityPageProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Strip legacy ?section=logs on mount ─────────────────────────────────
  // ─── Strip legacy ?section=logs on mount (only when not embedded) ──────
  useEffect(() => {
    if (!embedded && searchParams.get("section") === "logs") {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("section");
      const nextQuery = nextParams.toString();
      router.replace(`/apps/${appId}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    }
    // Only run on mount (and when searchParams change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Warn sink: useMemo-backed Set<string> ───────────────────────────────
  const warnSink = useMemo(() => new Set<string>(), []);

  // Flush warnings via useEffect — console.warn once per unique message per render
  useEffect(() => {
    warnSink.forEach((message) => {
      console.warn(message);
    });
    // We intentionally clear after flushing so the next render starts fresh
    warnSink.clear();
  });

  const onWarn = useCallback(
    (message: string) => {
      warnSink.add(message);
    },
    [warnSink]
  );

  // ─── Data fetching ───────────────────────────────────────────────────────

  // Fetch all servers
  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  // Find the app across all servers (same pattern as existing page)
  const {
    data: appData,
    isLoading: appLoading,
    isError: appError,
  } = useQuery({
    queryKey: ["app", appId],
    queryFn: async () => {
      for (const server of servers) {
        try {
          const apps = await api.getApps(server.id);
          const app = apps.find((a: App) => a.id === appId);
          if (app) {
            return { app, server };
          }
        } catch {
          continue;
        }
      }
      return null;
    },
    enabled: servers.length > 0,
  });

  // Fetch app metrics
  const { data: metric = null } = useQuery({
    queryKey: ["app-metrics", appId],
    queryFn: () => api.getAppMetricsCurrent(appId),
    enabled: !!appId,
  });

  // Fetch plan data via the existing usePlan hook
  const { plan } = usePlan();

  // ─── Redeploy mutation ───────────────────────────────────────────────────
  const [redeployState, setRedeployState] = useState<"idle" | "in-progress">("idle");

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!appData) throw new Error("App not found");
      return api.deployApp(appData.server.id, appId);
    },
    onMutate: () => {
      setRedeployState("in-progress");
    },
    onSettled: () => {
      setRedeployState("idle");
      queryClient.invalidateQueries({ queryKey: ["app", appId] });
    },
  });

  const handleRedeploy = useCallback(() => {
    deployMutation.mutate();
  }, [deployMutation]);

  const handleOpenSettings = useCallback(() => {
    router.push(`/apps/${appId}?section=settings`);
  }, [router, appId]);

  const handleUpgrade = useCallback(() => {
    router.push("/settings?section=plan");
  }, [router]);

  const handleNextStepActivate = useCallback(
    (step: NextStep) => {
      if ("href" in step) {
        // Replace [id] placeholder with actual appId
        const href = step.href.replace("[id]", appId);
        router.push(href);
      }
    },
    [router, appId]
  );

  // ─── Page-level error state ──────────────────────────────────────────────
  if (appError) {
    const ErrorWrapper = embedded ? "div" : "main";
    return (
      <ErrorWrapper className={embedded ? "" : "mx-auto max-w-5xl px-6 py-8"}>
        <Card className="border-neutral-200 bg-white">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-10 w-10 text-neutral-400" />
            <p className="text-sm text-neutral-600">
              Unable to load security details. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["app", appId] })
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </ErrorWrapper>
    );
  }

  // ─── Loading state ───────────────────────────────────────────────────────
  if (appLoading || !appData) {
    const LoadingWrapper = embedded ? "div" : "main";
    return (
      <LoadingWrapper className={embedded ? "" : "mx-auto max-w-5xl px-6 py-8"}>
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600" />
        </div>
      </LoadingWrapper>
    );
  }

  // ─── Derived state ───────────────────────────────────────────────────────
  const { app, server } = appData;

  // Normalize app status to the AppStatus type used by the security module
  const appStatus: AppStatus = (() => {
    const raw = app.status?.toLowerCase();
    if (raw === "running") return "running";
    if (raw === "deploying") return "deploying";
    if (raw === "stopped" || raw === "stopping") return "stopped";
    if (raw === "error" || raw === "delete_failed") return "error";
    return "pending";
  })();

  // Domain configured check
  const domainConfigured =
    typeof app.domain === "string" && app.domain.trim().length > 0;

  // Compute appUrl for the Open action
  const appUrl: string | null = (() => {
    if (domainConfigured) {
      return app.domain!;
    }
    const fallback = appAccessUrl(app, server);
    return fallback?.url ?? null;
  })();

  // Compute fallback URL for the domain summary card
  const fallbackUrl: string = (() => {
    const fallback = appAccessUrl(app, server);
    return fallback?.url ?? `http://localhost:${app.port ?? 3000}`;
  })();

  // Derive plan tier
  const tier = derivePlanTier(
    { plan: plan?.slug ?? null },
    onWarn
  );

  // Derive shield states
  const states = deriveShieldStates({
    tier,
    appStatus,
    domainConfigured,
  });

  // Compute security score and status
  const score = computeSecurityScore(states);
  const status = deriveSecurityStatus(score);

  // Derive SSL indicator
  const sslIndicator = deriveSslIndicator(domainConfigured, states.SSL_Shield);

  // Select next step
  const nextStep = selectNextStep({
    appStatus,
    domainConfigured,
    tier,
    states,
  });

  // ─── Render eight regions in fixed order ─────────────────────────────────
  // When embedded as a tab, use a div wrapper instead of <main> to avoid nested landmarks
  const Wrapper = embedded ? "div" : "main";

  return (
    <Wrapper className={embedded ? "space-y-6" : "mx-auto max-w-5xl px-6 py-8 space-y-6"}>
      {/* Region 1: Header — hidden when embedded in the app details page */}
      {!embedded && (
        <header>
          <section aria-labelledby="header-region-title">
            <h2 id="header-region-title" className="sr-only">
              App Header
            </h2>
            <AppHeaderActions
              appName={app.name}
              appType={
                app.buildpackOverride === "static" || app.buildpackOverride === "html"
                  ? "STATIC"
                  : "NODEJS"
              }
              appStatus={appStatus}
              domainConfigured={domainConfigured}
              appUrl={appUrl}
              onRedeploy={handleRedeploy}
              onOpenSettings={handleOpenSettings}
              redeployState={redeployState}
            />
          </section>
        </header>
      )}

      {/* Region 2: Security Summary */}
      <section aria-labelledby="security-summary-title">
        <h2 id="security-summary-title" className="sr-only">
          Security Summary
        </h2>
        <SecuritySummaryCard
          planTier={tier}
          score={score}
          status={status}
          description={SECURITY_STATUS_DESCRIPTIONS[status]}
          isDeploying={appStatus === "deploying"}
        />
      </section>

      {/* Region 3: Active Bundle */}
      <section aria-labelledby="active-bundle-title">
        <h2 id="active-bundle-title" className="sr-only">
          Active Protections
        </h2>
        <ActiveBundleSection states={states} />
      </section>

      {/* Region 4: Locked Bundle */}
      <section aria-labelledby="locked-bundle-title">
        <h2 id="locked-bundle-title" className="sr-only">
          Locked Protections
        </h2>
        <LockedBundleSection
          states={states}
          onUpgrade={handleUpgrade}
          upgradeRouteRegistered={UPGRADE_ROUTE_REGISTERED}
        />
      </section>

      {/* Region 5: Domain Summary */}
      <section aria-labelledby="domain-summary-title">
        <h2 id="domain-summary-title" className="sr-only">
          Domain Summary
        </h2>
        <DomainSummaryCard
          domain={domainConfigured ? app.domain! : null}
          fallbackUrl={fallbackUrl}
          sslIndicator={sslIndicator}
        />
      </section>

      {/* Region 6: Environment Summary */}
      <section aria-labelledby="environment-summary-title">
        <h2 id="environment-summary-title" className="sr-only">
          Environment Summary
        </h2>
        <EnvironmentSummaryCard
          envVars={app.envVars as Record<string, string> | null | undefined}
          appId={appId}
        />
      </section>

      {/* Region 7: Monitoring Summary */}
      <section aria-labelledby="monitoring-summary-title">
        <h2 id="monitoring-summary-title" className="sr-only">
          Monitoring Summary
        </h2>
        <MonitoringSummaryCard
          metric={metric as AppMetricCurrent | null}
          appStatusFallback={appStatus}
        />
      </section>

      {/* Region 8: Next Step Guidance */}
      <section aria-labelledby="next-step-guidance-title">
        <h2 id="next-step-guidance-title" className="sr-only">
          Next Step Guidance
        </h2>
        <NextStepGuidanceCard
          step={nextStep}
          onActivate={handleNextStepActivate}
        />
      </section>
    </Wrapper>
  );
}
