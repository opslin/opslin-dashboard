import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@/lib/api";
import { EXPORT_MAX_FILES, assetsToCsv, assetsToJson, exportZip, extensionFor, safeSegment, zipNames } from "../export";
import { buildZip, crc32 } from "../zip";

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
    id: "11111111-2222-4333-8444-555555555555", hash: "a".repeat(64), name: "Red shoe", folder: "products/banners", tags: ["sale", "red"], type: "image/webp",
    bytes: 1234, width: 1200, height: 800, thumbhash: null, widths: [320], variantBytes: 0, createdAt: "2026-10-06T10:00:00.000Z", updatedAt: "2026-10-06T10:00:00.000Z",
    urls: { master: "https://img.example.com/masters/aa/x", variants: {} }, ...over,
});

/** Reads a ZIP the way unzip does: end record, central directory, then each file. */
async function readZip(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    let end = bytes.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
    expect(end).toBeGreaterThanOrEqual(0);
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const out: Array<{ name: string; data: Uint8Array; crc: number }> = [];
    for (let i = 0; i < count; i++) {
        expect(view.getUint32(at, true)).toBe(0x02014b50);
        const crc = view.getUint32(at + 16, true);
        const size = view.getUint32(at + 24, true);
        const nameLength = view.getUint16(at + 28, true);
        const local = view.getUint32(at + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
        expect(view.getUint32(local, true)).toBe(0x04034b50);
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        out.push({ name, data: bytes.slice(start, start + size), crc });
        at += 46 + nameLength;
    }
    return out;
}

describe("zip", () => {
    it("crc32 matches a known value and Node's own", () => {
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
        const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) & 255);
        expect(crc32(data)).toBe(nodeCrc32(data));
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    it("writes a readable archive with names, bytes and checksums intact (including non-ASCII names and empty files)", async () => {
        const files = [
            { name: "products/Red shoe.webp", data: Uint8Array.from({ length: 3000 }, (_, i) => i & 255) },
            { name: "été/café ☕.png", data: new TextEncoder().encode("png bytes") },
            { name: "empty.jpg", data: new Uint8Array(0) },
        ];
        const read = await readZip(buildZip(files));
        expect(read.map((f) => f.name)).toEqual(files.map((f) => f.name));
        files.forEach((file, i) => {
            expect(Array.from(read[i]!.data)).toEqual(Array.from(file.data));
            expect(read[i]!.crc).toBe(nodeCrc32(file.data));
        });
    });

    it("an empty archive is still valid", async () => {
        expect(await readZip(buildZip([]))).toEqual([]);
    });
});

describe("names", () => {
    it("makes file names safe and never empty", () => {
        expect(safeSegment('a<b>:c"d|e?f*g\\h/i')).toBe("a b c d e f g h i");
        expect(safeSegment("  ...hidden  ")).toBe("hidden");
        expect(safeSegment("../../etc/passwd")).toBe("etc passwd");
        expect(safeSegment("\u0000\u0007")).toBe("image");
        expect(safeSegment("x".repeat(300)).length).toBe(100);
        expect(extensionFor("image/jpeg")).toBe("jpg");
        expect(extensionFor("weird/type")).toBe("img");
    });

    it("keeps folders and numbers duplicates, ignoring case", () => {
        const names = zipNames([asset(), asset({ id: "2" }), asset({ id: "3", name: "RED SHOE" }), asset({ id: "4", folder: "" }), asset({ id: "5", folder: "a/../b" })]);
        expect(names).toEqual([
            "products/banners/Red shoe.webp",
            "products/banners/Red shoe (2).webp",
            "products/banners/RED SHOE (3).webp",
            "Red shoe.webp",
            "a/b/Red shoe.webp",
        ]);
    });

    it("never lets a stored folder or name climb out of the archive", () => {
        const names = zipNames([asset({ folder: "../../x", name: "../evil" }), asset({ folder: "/abs", name: "C:\\win" })]);
        for (const name of names) {
            expect(name).not.toContain("..");
            expect(name.startsWith("/")).toBe(false);
            expect(name).not.toContain("\\");
        }
    });
});

describe("csv and json", () => {
    it("writes a header and one escaped row per image", () => {
        const csv = assetsToCsv([asset({ name: 'Say "hi", friend' })]);
        const [header, row] = csv.trim().split("\r\n");
        expect(header).toBe("id,name,folder,tags,type,width,height,bytes,created,updated,url");
        expect(row).toBe('11111111-2222-4333-8444-555555555555,"Say ""hi"", friend",products/banners,sale;red,image/webp,1200,800,1234,2026-10-06T10:00:00.000Z,2026-10-06T10:00:00.000Z,https://img.example.com/masters/aa/x');
    });

    it("neutralizes spreadsheet formulas and keeps empty cells empty", () => {
        const csv = assetsToCsv([asset({ name: "=HYPERLINK(\"http://evil\")", folder: "+1", width: null, height: null, urls: null, tags: [] })]);
        const row = csv.trim().split("\r\n")[1]!;
        expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
        expect(row).toContain(",'+1,");
        expect(row.endsWith(",,,,image/webp,,,1234,2026-10-06T10:00:00.000Z,2026-10-06T10:00:00.000Z,") || row.includes(",image/webp,,,1234,")).toBe(true);
    });

    it("json keeps the useful fields only", () => {
        const [first] = JSON.parse(assetsToJson([asset()]));
        expect(first).toMatchObject({ name: "Red shoe", folder: "products/banners", tags: ["sale", "red"], urls: { master: "https://img.example.com/masters/aa/x" } });
        expect(first).not.toHaveProperty("hash");
        expect(first).not.toHaveProperty("thumbhash");
    });
});

describe("exportZip", () => {
    it("downloads each master from the image domain and zips them with progress", async () => {
        const seen: string[] = [];
        const fetchImpl = (async (url: string) => {
            seen.push(url);
            return new Response(new TextEncoder().encode(`bytes of ${url}`));
        }) as unknown as typeof fetch;
        const progress: number[] = [];
        const blob = await exportZip([asset(), asset({ id: "2", name: "Blue", urls: { master: "https://img.example.com/masters/bb/y", variants: {} } }), asset({ id: "3", urls: null })], (p) => progress.push(p.done), fetchImpl);
        expect(seen).toEqual(["https://img.example.com/masters/aa/x", "https://img.example.com/masters/bb/y"]);
        expect(progress).toEqual([1, 2]);
        const read = await readZip(blob);
        expect(read.map((f) => f.name)).toEqual(["products/banners/Red shoe.webp", "products/banners/Blue.webp"]);
        expect(new TextDecoder().decode(read[1]!.data)).toBe("bytes of https://img.example.com/masters/bb/y");
    });

    it("stops with a plain message when one download fails, or the selection is too big", async () => {
        const failing = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
        await expect(exportZip([asset()], undefined, failing)).rejects.toThrow(/Couldn't download "Red shoe" \(404\)/);
        await expect(exportZip(Array.from({ length: EXPORT_MAX_FILES + 1 }, (_, i) => asset({ id: String(i) })))).rejects.toThrow(/up to 1000/);
        await expect(exportZip([asset({ bytes: 2 * 1024 ** 3 })])).rejects.toThrow(/more than 1 GB/);
    });
});
