import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { apiBaseUrl, authenticateUser, requireEnv } from "./helpers";

const execFileAsync = promisify(execFile);

function cliBinaryPath() {
    return process.env.OPSLIN_CLI_BIN
        || path.resolve(process.cwd(), "../opslin-agent/bin/opslin");
}

test("opslin cli deploy --wait uploads a local project and streams progress", async ({ page }) => {
    const cliBin = cliBinaryPath();
    test.skip(!existsSync(cliBin), "OPSLIN_CLI_BIN must point to a built opslin binary");

    const serverId = requireEnv("E2E_SERVER_ID");
    const credentials = await authenticateUser(page, `${Date.now()}-cli-deploy`);

    const projectDir = await mkdtemp(path.join(tmpdir(), "opslin-cli-deploy-"));
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({
        name: "opslin-cli-deploy",
        version: "1.0.0",
        scripts: {
            start: "node index.js",
        },
    }, null, 2));
    await writeFile(path.join(projectDir, "index.js"), "console.log('opslin cli deploy');\n");

    try {
        await execFileAsync(
            cliBin,
            [
                "--api-url",
                apiBaseUrl(),
                "auth",
                "login",
                "--email",
                credentials.email,
                "--password",
                credentials.password,
            ],
            {
                env: {
                    ...process.env,
                    NO_COLOR: "1",
                },
            }
        );

        const result = await execFileAsync(
            cliBin,
            [
                "--api-url",
                apiBaseUrl(),
                "--json",
                "apps",
                "deploy",
                "--server",
                serverId,
                "--name",
                `cli-upload-${Date.now()}`,
                "--path",
                projectDir,
                "--wait",
            ],
            {
                env: {
                    ...process.env,
                    NO_COLOR: "1",
                },
                maxBuffer: 10 * 1024 * 1024,
            }
        );

        expect(result.stdout).toContain("\"jobId\"");
    } finally {
        await rm(projectDir, { recursive: true, force: true });
    }
});
