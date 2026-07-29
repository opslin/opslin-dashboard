import { test, expect } from "@playwright/test";
import {
    apiBaseUrl,
    authenticateUser,
    getJson,
    postJson,
    readAuthToken,
    requireEnv,
} from "./helpers";

test("create postgres db -> seed -> inspect tables", async ({ page, request }) => {
    const serverId = requireEnv("E2E_SERVER_ID");

    await authenticateUser(page, `${Date.now()}-db`);
    const token = await readAuthToken(page);

    const createResponse = await postJson(
        request,
        `/servers/${serverId}/databases`,
        token,
        {
            name: `pwdb-${Date.now()}`,
            type: "postgresql",
            exposure: "internal",
        }
    );
    expect(createResponse.ok()).toBeTruthy();
    const createdDb = await createResponse.json();

    await page.goto("/databases");
    await expect(page.getByText(createdDb.name)).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => {
        const detailResponse = await getJson(
            request,
            `/servers/${serverId}/databases/${createdDb.id}`,
            token
        );
        if (!detailResponse.ok()) {
            return `http-${detailResponse.status()}`;
        }

        const detail = await detailResponse.json();
        return detail.status;
    }, {
        timeout: 60_000,
    }).toBe("running");

    const writableResponse = await request.patch(
        `${apiBaseUrl()}/servers/${serverId}/databases/${createdDb.id}/readonly`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            data: {
                readOnly: false,
            },
        }
    );
    expect(writableResponse.ok()).toBeTruthy();

    const seedResponse = await postJson(
        request,
        `/servers/${serverId}/databases/${createdDb.id}/seed`,
        token,
        {}
    );
    expect(seedResponse.ok()).toBeTruthy();
});
