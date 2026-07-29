// Barrel re-export for lib/security modules.
// Populated as modules land in subsequent tasks.

export {
  SHIELDS,
  SHIELD_ORDER,
  SHIELD_CATALOG,
  type Shield,
  type ShieldDescriptor,
} from "./shield-catalog";

export {
  PLAN_TIERS,
  PLAN_TIER_ORDER,
  PLAN_BUNDLES,
  bundleFor,
  lowestUnlockingTier,
  isShieldRecognized,
  type PlanTier,
} from "./plan-bundle-map";

export {
  derivePlanTier,
  deriveShieldStates,
  computeSecurityScore,
  deriveSecurityStatus,
  deriveSslIndicator,
  selectNextStep,
  SECURITY_STATUS_DESCRIPTIONS,
  type ShieldState,
  type AppStatus,
  type SecurityStatus,
  type PlanLikeInputs,
  type DeriveShieldStatesInputs,
  type NextStepInputs,
  type NextStep,
} from "./shield-state";
