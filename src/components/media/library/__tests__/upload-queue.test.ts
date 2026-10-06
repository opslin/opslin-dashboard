import { describe, expect, it, vi } from "vitest";
import { createUploadQueue, type UploadItem, type UploadRunner } from "../upload-queue";

const file = (name: string) => new File([new Uint8Array(10)], name, { type: "image/jpeg" });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(run: UploadRunner, concurrency = 2) {
    const changes: UploadItem[][] = [];
    const uploaded: string[] = [];
    const queue = createUploadQueue({
        run,
        concurrency,
        describeError: (error) => ({ message: (error as Error).message, limit: (error as Error).message.startsWith("limit") }),
        onChange: (items) => changes.push(items),
        onUploaded: (item) => void uploaded.push(item.name),
    });
    return { queue, changes, uploaded };
}

describe("upload queue", () => {
    it("runs a few at a time, in order, and keeps every file's row until it is dismissed", async () => {
        let active = 0;
        let peak = 0;
        const gates: Array<() => void> = [];
        const { queue, uploaded } = setup((f) => {
            active++;
            peak = Math.max(peak, active);
            return new Promise((resolve) => gates.push(() => { active--; resolve(f.name); }));
        });
        queue.add(["a", "b", "c", "d"].map((name) => ({ file: file(name), folder: "x" })));
        await tick();
        expect(queue.snapshot().map((i) => i.status)).toEqual(["working", "working", "waiting", "waiting"]);
        gates.shift()!();
        await tick();
        expect(queue.snapshot().map((i) => i.status)).toEqual(["done", "working", "working", "waiting"]);
        while (gates.length) { gates.shift()!(); await tick(); }
        expect(queue.snapshot().map((i) => i.status)).toEqual(["done", "done", "done", "done"]);
        expect(peak).toBe(2);
        expect(uploaded).toEqual(["a", "b", "c", "d"]);
        queue.removeDone();
        expect(queue.snapshot()).toEqual([]);
    });

    it("reports progress on the row and sends each file to its own folder", async () => {
        const seen: Array<[string, string]> = [];
        const { queue, changes } = setup(async (f, { folder, onProgress }) => {
            seen.push([f.name, folder]);
            onProgress({ stage: "uploading", done: 1, total: 4 });
        });
        queue.add([{ file: file("a.jpg"), folder: "products" }, { file: file("b.jpg"), folder: "" }]);
        await tick();
        expect(seen).toEqual([["a.jpg", "products"], ["b.jpg", ""]]);
        expect(changes.some((c) => c[0]?.stage === "uploading" && c[0]?.done === 1 && c[0]?.total === 4)).toBe(true);
    });

    it("a failure stays on its row with the reason, the others carry on, and Retry runs it again", async () => {
        let fail = true;
        const { queue } = setup(async (f) => {
            if (f.name === "bad.jpg" && fail) throw new Error("The image is too large to upload.");
        });
        queue.add([file("bad.jpg"), file("ok.jpg")].map((f) => ({ file: f, folder: "" })));
        await tick();
        expect(queue.snapshot()).toMatchObject([{ status: "failed", message: "The image is too large to upload." }, { status: "done" }]);
        fail = false;
        queue.retry(queue.snapshot()[0]!.id);
        await tick();
        expect(queue.snapshot()[0]).toMatchObject({ status: "done", message: null });
    });

    it("a limit pauses what has not started, says why once, and retry resumes them", async () => {
        const run = vi.fn(async (f: File) => {
            if (f.name === "a.jpg") throw new Error("limit: The upload limit for today is reached. Try again later.");
        });
        const { queue } = setup(run, 1);
        queue.add(["a.jpg", "b.jpg", "c.jpg"].map((name) => ({ file: file(name), folder: "" })));
        await tick();
        expect(queue.snapshot().map((i) => i.status)).toEqual(["failed", "paused", "paused"]);
        expect(run).toHaveBeenCalledTimes(1);
        run.mockImplementation(async () => undefined);
        queue.retry();
        await tick();
        await tick();
        expect(queue.snapshot().map((i) => i.status)).toEqual(["failed", "done", "done"]);
    });

    it("dismisses finished or failed rows but never one that is working", async () => {
        let release: () => void = () => undefined;
        const { queue } = setup(() => new Promise<void>((resolve) => { release = resolve; }));
        queue.add([{ file: file("a.jpg"), folder: "" }]);
        await tick();
        const id = queue.snapshot()[0]!.id;
        queue.dismiss(id);
        expect(queue.snapshot()).toHaveLength(1);
        release();
        await tick();
        queue.dismiss(id);
        expect(queue.snapshot()).toEqual([]);
    });
});
