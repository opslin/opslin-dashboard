import { describe, expect, it } from "vitest";
import { aiStepIndex } from "../ai-deploy-steps";

describe("aiStepIndex", () => {
    it("maps the server's phases to the four steps", () => {
        expect(aiStepIndex("analyzing", 5)).toBe(0);
        expect(aiStepIndex("planning", 15)).toBe(0);
        expect(aiStepIndex("provisioning", 18)).toBe(1);
        expect(aiStepIndex("creating_app", 20)).toBe(1);
        expect(aiStepIndex("rehearsing", 30)).toBe(2);
        expect(aiStepIndex("preparing", 30)).toBe(2);
        expect(aiStepIndex("building", 60)).toBe(2);
        expect(aiStepIndex("checking", 80)).toBe(3);
        expect(aiStepIndex("wiring", 90)).toBe(3);
    });

    it("no longer calls a long build 'writing the Dockerfile': 15% with a building phase is the build step", () => {
        expect(aiStepIndex("building", 15)).toBe(2);
    });

    it("falls back to the percent for a run that reports no phase", () => {
        expect(aiStepIndex(undefined, 5)).toBe(0);
        expect(aiStepIndex(undefined, 30)).toBe(1);
        expect(aiStepIndex("", 60)).toBe(2);
        expect(aiStepIndex("something-new", 90)).toBe(3);
    });
});
