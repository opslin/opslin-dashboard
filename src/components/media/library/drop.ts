/**
 * Turns what was dropped (files, or whole folders) into a flat list of image files with the folder each one was in,
 * so dropping "summer/banners" onto the library recreates that folder structure.
 */

export type DroppedFile = { file: File; relativeDir: string };

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export function isAcceptedImage(file: File): boolean {
    return (ACCEPTED_TYPES as readonly string[]).includes(file.type);
}

type FsEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    file?(done: (file: File) => void, fail: (error: unknown) => void): void;
    createReader?(): { readEntries(done: (entries: FsEntry[]) => void, fail: (error: unknown) => void): void };
};

const MAX_DEPTH = 8;
const MAX_FILES = 5000;

async function readAll(entry: FsEntry): Promise<FsEntry[]> {
    const reader = entry.createReader!();
    const all: FsEntry[] = [];
    for (;;) {
        const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) return all;
        all.push(...batch);
    }
}

async function walk(entry: FsEntry, dir: string, depth: number, out: DroppedFile[]) {
    if (out.length >= MAX_FILES) return;
    if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
        out.push({ file, relativeDir: dir });
    } else if (entry.isDirectory && depth < MAX_DEPTH) {
        for (const child of await readAll(entry)) await walk(child, dir ? `${dir}/${entry.name}` : entry.name, depth + 1, out);
    }
}

/** Entries must be captured synchronously inside the drop event; call this right there. */
export async function collectDropped(transfer: Pick<DataTransfer, "items" | "files">): Promise<DroppedFile[]> {
    const out: DroppedFile[] = [];
    const entries: FsEntry[] = [];
    for (const item of Array.from(transfer.items ?? [])) {
        const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
        if (entry) entries.push(entry);
    }
    if (entries.length === 0) {
        return Array.from(transfer.files ?? []).map((file) => ({ file, relativeDir: "" }));
    }
    for (const entry of entries) await walk(entry, "", 0, out);
    return out;
}

/** From an `<input webkitdirectory>` choice: the folder part of each file's relative path. */
export function fromDirectoryInput(files: FileList | File[]): DroppedFile[] {
    return Array.from(files).map((file) => {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        const parts = path.split("/");
        parts.pop();
        return { file, relativeDir: parts.join("/") };
    });
}

/** Joins the current library folder with the dropped folder's path into a valid library folder (or reports what was skipped). */
export function targetFolder(current: string, relativeDir: string): string {
    const clean = relativeDir
        .split("/")
        .map((part) =>
            part
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Za-z0-9 ._-]/g, "-")
                .replace(/-{2,}/g, "-")
                .replace(/^[ -]+|[ -]+$/g, "")
                .slice(0, 60),
        )
        .filter((part) => part !== "" && part !== "." && part !== "..");
    const joined = [...current.split("/").filter(Boolean), ...clean].slice(0, 8).join("/");
    return joined;
}
