import { describe, expect, it } from "vitest";
import { recipeLine } from "../DeployProgressDialog";

describe("recipeLine", () => {
    it("names the owner's recipe when every app used it", () => expect(recipeLine([{ recipe: "own" }])).toMatch(/own Dockerfile/));
    it("names the written recipe", () => expect(recipeLine([{ recipe: "written" }])).toMatch(/Opslin wrote/));
    it("says mixed when both are used", () => expect(recipeLine([{ recipe: "own" }, { recipe: "written" }])).toMatch(/Some apps/));
    it("is silent when nothing reported", () => expect(recipeLine([{}])).toBeNull());
});
