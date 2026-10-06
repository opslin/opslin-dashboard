/**
 * The upload list behind the library's Upload button, drag and drop and folder upload. A few files at a time; every file
 * keeps its row from "waiting" to "done" (or to a plain failure with Retry). A daily or burst limit pauses the files
 * that have not started and says so, instead of failing each one separately.
 */

export type UploadStatus = "waiting" | "working" | "done" | "failed" | "paused";

export type UploadItem = {
    id: string;
    name: string;
    folder: string;
    status: UploadStatus;
    stage: string | null;
    done: number;
    total: number;
    /** Plain-language reason for failed or paused. */
    message: string | null;
};

export type UploadRunner = (file: File, options: { folder: string; onProgress: (progress: { stage: string; done: number; total: number }) => void }) => Promise<unknown>;

type Failure = { message: string; limit: boolean };

export type UploadQueueDeps = {
    run: UploadRunner;
    describeError: (error: unknown) => Failure;
    onChange: (items: UploadItem[]) => void;
    /** Called when a file finishes successfully (to refresh the list). */
    onUploaded?: (item: UploadItem) => void | Promise<void>;
    concurrency?: number;
};

export function createUploadQueue(deps: UploadQueueDeps) {
    const concurrency = deps.concurrency ?? 2;
    const items: UploadItem[] = [];
    const files = new Map<string, File>();
    let sequence = 0;
    let running = 0;

    const emit = () => deps.onChange(items.map((item) => ({ ...item })));

    function update(id: string, patch: Partial<UploadItem>) {
        const item = items.find((entry) => entry.id === id);
        if (item) Object.assign(item, patch);
        emit();
    }

    async function work(item: UploadItem) {
        const file = files.get(item.id);
        if (!file) return;
        update(item.id, { status: "working", stage: "Reading", message: null });
        try {
            await deps.run(file, { folder: item.folder, onProgress: (progress) => update(item.id, { stage: progress.stage, done: progress.done, total: progress.total }) });
            update(item.id, { status: "done", stage: null });
            files.delete(item.id);
            await deps.onUploaded?.(item);
        } catch (error) {
            const failure = deps.describeError(error);
            update(item.id, { status: "failed", stage: null, message: failure.message });
            if (failure.limit) {
                // Everything that has not started waits for the limit to lift instead of failing one by one.
                for (const other of items) {
                    if (other.status === "waiting") {
                        other.status = "paused";
                        other.message = failure.message;
                    }
                }
                emit();
            }
        }
    }

    function pump() {
        while (running < concurrency) {
            const next = items.find((item) => item.status === "waiting");
            if (!next) return;
            running++;
            next.status = "working";
            void work(next).finally(() => {
                running--;
                pump();
            });
        }
    }

    return {
        add(entries: Array<{ file: File; folder: string }>) {
            for (const entry of entries) {
                const id = `u${++sequence}`;
                files.set(id, entry.file);
                items.push({ id, name: entry.file.name, folder: entry.folder, status: "waiting", stage: null, done: 0, total: 0, message: null });
            }
            emit();
            pump();
        },
        /** Try a failed or paused file (or every paused one) again. */
        retry(id?: string) {
            for (const item of items) {
                if ((id ? item.id === id : item.status === "paused") && (item.status === "failed" || item.status === "paused") && files.has(item.id)) {
                    item.status = "waiting";
                    item.message = null;
                }
            }
            emit();
            pump();
        },
        dismiss(id: string) {
            const index = items.findIndex((item) => item.id === id);
            if (index >= 0 && items[index]!.status !== "working") {
                files.delete(id);
                items.splice(index, 1);
                emit();
            }
        },
        removeDone() {
            for (let i = items.length - 1; i >= 0; i--) if (items[i]!.status === "done") items.splice(i, 1);
            emit();
        },
        snapshot: () => items.map((item) => ({ ...item })),
    };
}
