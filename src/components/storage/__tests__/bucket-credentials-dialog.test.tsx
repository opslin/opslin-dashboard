import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ revealR2BucketCredentials: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ApiRequestError } from "@/lib/api";
import { BucketCredentialsDialog } from "@/components/storage/bucket-credentials-dialog";

const bucket = { id: "b1", bucketName: "my-bucket", s3Endpoint: "https://acct.r2.cloudflarestorage.com" };
const variables = { R2_ACCESS_KEY_ID: "key-id-123", R2_SECRET_ACCESS_KEY: "very-secret-456", R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com", R2_BUCKET: "my-bucket" };

function renderDialog() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <BucketCredentialsDialog bucket={bucket} onClose={() => undefined} />
        </QueryClientProvider>
    );
}

describe("bucket connection details", () => {
    beforeEach(() => {
        apiMock.revealR2BucketCredentials.mockReset();
        Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
    });

    it("shows the four usual names, keeps the secret hidden until asked, and renames with a prefix", async () => {
        apiMock.revealR2BucketCredentials.mockResolvedValue({ variables });
        renderDialog();
        expect(await screen.findByText("R2_ACCESS_KEY_ID")).toBeInTheDocument();
        for (const name of ["R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"]) expect(screen.getByText(name)).toBeInTheDocument();
        expect(screen.getByText("key-id-123")).toBeInTheDocument();
        expect(screen.queryByText("very-secret-456")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Show secret access key" }));
        expect(screen.getByText("very-secret-456")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Hide secret access key" }));
        expect(screen.queryByText("very-secret-456")).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Name prefix"), { target: { value: "s3" } });
        expect(screen.getByText("S3_SECRET_ACCESS_KEY")).toBeInTheDocument();
        expect(screen.queryByText("R2_SECRET_ACCESS_KEY")).not.toBeInTheDocument();
    });

    it("copies all four as a .env block, using the chosen prefix", async () => {
        apiMock.revealR2BucketCredentials.mockResolvedValue({ variables });
        renderDialog();
        await screen.findByText("R2_ACCESS_KEY_ID");
        fireEvent.change(screen.getByLabelText("Name prefix"), { target: { value: "STORAGE" } });
        fireEvent.click(screen.getByRole("button", { name: "Copy as .env" }));
        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                "STORAGE_ACCESS_KEY_ID=key-id-123\nSTORAGE_SECRET_ACCESS_KEY=very-secret-456\nSTORAGE_ENDPOINT=https://acct.r2.cloudflarestorage.com\nSTORAGE_BUCKET=my-bucket"
            )
        );
    });

    it("says plainly who can see keys when the API refuses, and shows no values", async () => {
        apiMock.revealR2BucketCredentials.mockRejectedValue(new ApiRequestError(403, { message: "no" }));
        renderDialog();
        expect(await screen.findByText(/Only owners and admins can see bucket keys/)).toBeInTheDocument();
        expect(screen.queryByText("key-id-123")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Copy as .env" })).toBeDisabled();
    });
});
