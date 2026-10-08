import { describe, expect, it } from "vitest";
import { LIBRARY, commandRisk, explainError, suggestCommand } from "../commands";

describe("terminal commands", () => {
    it("marks library commands that change the server", () => {
        expect(commandRisk("df -h")).toBe("read");
        expect(commandRisk("sudo systemctl restart docker")).toBe("change");
        expect(LIBRARY.filter((item) => item.risk === "change").every((item) => item.warning)).toBe(true);
    });

    it("treats unknown risky commands as changing the server", () => {
        expect(commandRisk("rm -rf /var/www")).toBe("change");
        expect(commandRisk("sudo apt upgrade -y")).toBe("change");
        expect(commandRisk("echo hello")).toBe("read");
    });

    it("suggests a read-only command for plain-language requests", () => {
        expect(suggestCommand("show me which apps use the most memory")?.command).toContain("docker stats");
        expect(suggestCommand("how much disk is left")?.command).toBe("df -h");
        expect(suggestCommand("show the last 20 lines of my api logs")?.command).toBe("docker logs --tail 20 api");
        expect(suggestCommand("update the system")?.risk).toBe("change");
        expect(suggestCommand("zzz")).toBeNull();
        expect(suggestCommand("   ")).toBeNull();
    });

    it("explains common errors", () => {
        expect(explainError("permission denied while trying to connect to the Docker daemon socket")?.explanation).toMatch(/Docker/);
        expect(explainError("bash: foo: command not found")?.explanation).toMatch(/spelling/);
        expect(explainError("all good")).toBeNull();
    });
});
