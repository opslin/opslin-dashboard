import { describe, expect, it } from "vitest";
import type { DeleteAppResponse } from "../api";

describe("DeleteAppResponse", () => {
    it("accepts the backend deleting response contract", () => {
        const response: DeleteAppResponse = {
            success: true,
            status: "deleting",
            jobId: "delete-app-1",
            message: "App cleanup queued",
        };

        expect(response.status).toBe("deleting");
        expect(response.jobId).toBe("delete-app-1");
    });
});
