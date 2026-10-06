import { describe, expect, it } from "vitest";
import { collectDropped, fromDirectoryInput, isAcceptedImage, targetFolder } from "../drop";

const file = (name: string, type = "image/jpeg") => new File([new Uint8Array(3)], name, { type });

function fileEntry(f: File) {
    return { isFile: true, isDirectory: false, name: f.name, file: (done: (f: File) => void) => done(f) };
}
function dirEntry(name: string, children: unknown[], batch = 2) {
    return {
        isFile: false,
        isDirectory: true,
        name,
        createReader: () => {
            let at = 0;
            return { readEntries: (done: (e: unknown[]) => void) => { done(children.slice(at, at + batch)); at += batch; } };
        },
    };
}
const transferOf = (entries: unknown[], files: File[] = []) => ({ items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })), files }) as unknown as DataTransfer;

describe("isAcceptedImage", () => {
    it("takes JPEG, PNG, WebP and AVIF only", () => {
        expect(["image/jpeg", "image/png", "image/webp", "image/avif"].every((t) => isAcceptedImage(file("x", t)))).toBe(true);
        expect(["image/gif", "image/svg+xml", "application/pdf", ""].some((t) => isAcceptedImage(file("x", t)))).toBe(false);
    });
});

describe("collectDropped", () => {
    it("walks dropped folders, reading every batch of entries, and remembers each file's folder", async () => {
        const dropped = await collectDropped(
            transferOf([
                fileEntry(file("loose.jpg")),
                dirEntry("summer", [fileEntry(file("a.jpg")), fileEntry(file("b.jpg")), dirEntry("banners", [fileEntry(file("c.png", "image/png"))]), fileEntry(file("d.jpg"))]),
            ]),
        );
        expect(dropped.map((d) => [d.file.name, d.relativeDir])).toEqual([["loose.jpg", ""], ["a.jpg", "summer"], ["b.jpg", "summer"], ["c.png", "summer/banners"], ["d.jpg", "summer"]]);
    });

    it("falls back to the plain file list when the browser has no folder support", async () => {
        const dropped = await collectDropped({ items: [] as unknown as DataTransferItemList, files: [file("a.jpg"), file("b.jpg")] as unknown as FileList });
        expect(dropped.map((d) => d.file.name)).toEqual(["a.jpg", "b.jpg"]);
        expect(dropped.every((d) => d.relativeDir === "")).toBe(true);
    });

    it("stops going deeper than 8 levels", async () => {
        let deepest: unknown = fileEntry(file("deep.jpg"));
        for (let i = 12; i > 0; i--) deepest = dirEntry(`d${i}`, [deepest]);
        expect(await collectDropped(transferOf([deepest]))).toEqual([]);
    });
});

describe("folder helpers", () => {
    it("reads the folder part of a chosen directory's relative paths", () => {
        const a = Object.assign(file("a.jpg"), { webkitRelativePath: "photos/summer/a.jpg" });
        const b = Object.assign(file("b.jpg"), { webkitRelativePath: "b.jpg" });
        expect(fromDirectoryInput([a, b]).map((d) => d.relativeDir)).toEqual(["photos/summer", ""]);
    });

    it("builds a valid library folder under the current one, dropping anything unsafe", () => {
        expect(targetFolder("", "")).toBe("");
        expect(targetFolder("products", "summer/banners")).toBe("products/summer/banners");
        expect(targetFolder("", "a/../b/./c")).toBe("a/b/c");
        expect(targetFolder("", "Café ☕/ok")).toBe("Cafe/ok");
        expect(targetFolder("", "!!!/ok")).toBe("ok");
        expect(targetFolder("1/2/3/4/5/6", "7/8/9/10")).toBe("1/2/3/4/5/6/7/8");
        expect(targetFolder("", "x".repeat(100)).length).toBe(60);
    });
});
