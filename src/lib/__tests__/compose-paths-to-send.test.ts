// The front door may choose compose files that are not at the top of the repository (a production project in a sub-folder).
// They are sent with the new app only when the person is deploying the repository the plain way: never for an AI deploy, an
// official image, an upload, or a recommendation without them.
import { describe, expect, it } from "vitest";
import { composePathsToSend, stackNeedsToShow, type DeployRecommendationData } from "../deploy-route-types";

const base = { route: "compose", confidence: "high", reasons: [], isMonorepo: false, units: [], needs: [], composeServices: [], safeMigrationAvailable: false, resolvedSha: null } as DeployRecommendationData;
const withPaths = { ...base, composePaths: ["infrastructure/prod/docker-compose.prod.yml", "infrastructure/prod/docker-compose.single-host.yml"] };
const plain = { usesAi: false, usesOfficialImage: false, overridden: false };

describe("composePathsToSend", () => {
    it("sends the files the front door chose", () => {
        expect(composePathsToSend(withPaths, plain)).toEqual(withPaths.composePaths);
    });
    it("sends nothing for a recommendation without them", () => {
        expect(composePathsToSend(base, plain)).toBeUndefined();
        expect(composePathsToSend({ ...base, composePaths: [] }, plain)).toBeUndefined();
        expect(composePathsToSend(null, plain)).toBeUndefined();
        expect(composePathsToSend(undefined, plain)).toBeUndefined();
    });
    it("sends nothing when the person chose the AI way or an official image instead", () => {
        expect(composePathsToSend(withPaths, { ...plain, usesAi: true })).toBeUndefined();
        expect(composePathsToSend(withPaths, { ...plain, usesOfficialImage: true })).toBeUndefined();
    });
    it("sends nothing when the person picked a way by hand instead of following the recommendation", () => {
        expect(composePathsToSend(withPaths, { ...plain, overridden: true })).toBeUndefined();
    });
    it("sends nothing unless the route really is compose", () => {
        expect(composePathsToSend({ ...withPaths, route: "ai" }, plain)).toBeUndefined();
        expect(composePathsToSend({ ...withPaths, route: "simple" }, plain)).toBeUndefined();
    });
});

describe("stackNeedsToShow", () => {
    const needs = { needsInput: [{ name: "RAZORPAY_KEY_ID", why: "Required by this project: its start-up check stops the app without it." }], replaceBeforeUse: [], willDo: [] };
    const base = { route: "ai", confidence: "high", reasons: [], isMonorepo: false, units: [], needs: [], composeServices: [], safeMigrationAvailable: false, resolvedSha: null, stackNeeds: needs } as unknown as DeployRecommendationData;

    it("shows what the project requires for the standard, compose and AI ways alike", () => {
        for (const route of ["simple", "compose", "ai"] as const) expect(stackNeedsToShow({ ...base, route }, { usesOfficialImage: false })).toEqual(needs);
    });
    it("shows nothing when the project's own image is deployed, or nothing is required", () => {
        expect(stackNeedsToShow(base, { usesOfficialImage: true })).toBeUndefined();
        expect(stackNeedsToShow({ ...base, stackNeeds: undefined }, { usesOfficialImage: false })).toBeUndefined();
        expect(stackNeedsToShow(null, { usesOfficialImage: false })).toBeUndefined();
    });
});
