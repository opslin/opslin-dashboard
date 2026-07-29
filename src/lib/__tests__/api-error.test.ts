import { describe, expect, it } from "vitest";
import { normalizeApiErrorPayload } from "../api";

describe("normalizeApiErrorPayload", () => {
    it("flattens structured API errors so plan-limit failures are user-readable", () => {
        const error = normalizeApiErrorPayload({
            error: {
                code: "plan_limit_exceeded",
                message: "Your current plan allows 15 apps.",
                details: {
                    feature: "app",
                    limit: 15,
                    current: 15,
                    requiredPlan: "business",
                },
                requestId: "req-1",
            },
        }, 403);

        expect(error.message).toBe("Your current plan allows 15 apps.");
        expect(error.code).toBe("plan_limit_exceeded");
        expect(error.error).toBe("plan_limit_exceeded");
        expect(error.feature).toBe("app");
        expect(error.limit).toBe(15);
        expect(error.current).toBe(15);
        expect(error.requiredPlan).toBe("business");
        expect(error.requestId).toBe("req-1");
    });
});
