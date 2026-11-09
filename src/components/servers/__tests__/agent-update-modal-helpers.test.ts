import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { formatBytes, updateLookupMessage, versionParts } from "../agent-update-modal";

describe("versionParts", () => {
    it("splits a long build version into the number and a note", () => {
        expect(versionParts("2.0.38-migration-dir-20261108")).toEqual({ number: "2.0.38", note: "migration-dir-20261108" });
        expect(versionParts("v2.0.37")).toEqual({ number: "2.0.37", note: null });
    });
    it("never throws on missing or odd input", () => {
        expect(versionParts(null)).toEqual({ number: "unknown", note: null });
        expect(versionParts("nightly")).toEqual({ number: "nightly", note: null });
    });
});

describe("formatBytes", () => {
    it("shows megabytes and kilobytes, nothing for an unknown size", () => {
        expect(formatBytes(13095072)).toBe("12.5 MB");
        expect(formatBytes(2048)).toBe("2 KB");
        expect(formatBytes(0)).toBeNull();
        expect(formatBytes(Number.NaN)).toBeNull();
    });
});

describe("updateLookupMessage", () => {
    it("explains a missing release in plain words, not the raw server text", () => {
        const error = new ApiRequestError(503, { code: "agent_release_unavailable", message: "Agent release details are temporarily unavailable. Verify the release manifest and agent binaries are deployed." });
        const message = updateLookupMessage(error);
        expect(message.title).toBe("No agent update has been published yet");
        expect(message.body).not.toMatch(/manifest|binaries/);
    });
    it("handles a removed server and any other failure", () => {
        expect(updateLookupMessage(new ApiRequestError(404, { message: "Server not found" })).title).toBe("This server was not found");
        expect(updateLookupMessage(new Error("boom")).title).toBe("Update details could not be loaded");
    });
});

import { runsLatest } from "../agent-update-modal";
describe("runsLatest", () => {
    it("trusts the server's answer, so a release with a build note still finishes", () => {
        expect(runsLatest({ updateAvailable: false })).toBe(true);
        expect(runsLatest({ updateAvailable: true })).toBe(false);
    });
});
