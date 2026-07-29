import { describe, expect, it } from "vitest";
import { parseError } from "../progress-modal";

describe("parseError", () => {
    it("does not classify generic connection refused as Docker daemon unavailable", () => {
        const error = "connect ECONNREFUSED 127.0.0.1:8080 while probing app health";

        expect(parseError(error)).toBe(error);
    });

    it("uses server wording for true Docker daemon or socket failures", () => {
        expect(
            parseError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?")
        ).toBe("Docker daemon is not reachable on the server. Start or repair Docker on the VPS, then retry.");
    });

    it("mentions Docker Desktop only for explicit local Mac/Desktop failures", () => {
        expect(
            parseError("Docker Desktop on macOS cannot connect to unix:///Users/me/.docker/run/docker.sock")
        ).toBe("Docker daemon is not reachable on this local Mac. Start Docker Desktop, then retry.");
    });

    it("uses server install wording when Docker Compose is missing", () => {
        expect(parseError("docker-compose: command not found")).toBe(
            "Docker Compose is not installed on the server. Install the Docker Compose plugin or CLI on the VPS, then retry."
        );
    });
});
