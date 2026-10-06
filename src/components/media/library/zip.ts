/**
 * A small ZIP writer (stored, no compression: images are already compressed). Runs in the browser so the files never
 * pass through Opslin. Limits are deliberate: under 4 GB and 65,000 files, so the plain (non-ZIP64) format is enough.
 */

export type ZipEntry = { name: string; data: Uint8Array; modified?: Date };

export const ZIP_MAX_BYTES = 4 * 1024 ** 3 - 1024 * 1024;
export const ZIP_MAX_FILES = 65_000;

let table: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
    if (!table) {
        table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = (table[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; day: number } {
    const year = Math.max(1980, date.getFullYear());
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

export function buildZip(entries: ZipEntry[]): Blob {
    if (entries.length > ZIP_MAX_FILES) throw new Error("Too many files for one ZIP");
    const total = entries.reduce((sum, entry) => sum + entry.data.length, 0);
    if (total > ZIP_MAX_BYTES) throw new Error("Too much data for one ZIP");

    const encoder = new TextEncoder();
    const parts: BlobPart[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const { time, day } = dosDateTime(entry.modified ?? new Date());
        const crc = crc32(entry.data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // names are UTF-8
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, time, true);
        local.setUint16(12, day, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, entry.data.length, true);
        local.setUint32(22, entry.data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local.buffer as ArrayBuffer, name as BlobPart, entry.data as BlobPart);

        const header = new DataView(new ArrayBuffer(46));
        header.setUint32(0, 0x02014b50, true);
        header.setUint16(4, 20, true);
        header.setUint16(6, 20, true);
        header.setUint16(8, 0x0800, true);
        header.setUint16(10, 0, true);
        header.setUint16(12, time, true);
        header.setUint16(14, day, true);
        header.setUint32(16, crc, true);
        header.setUint32(20, entry.data.length, true);
        header.setUint32(24, entry.data.length, true);
        header.setUint16(28, name.length, true);
        header.setUint32(42, offset, true);
        const record = new Uint8Array(46 + name.length);
        record.set(new Uint8Array(header.buffer), 0);
        record.set(name, 46);
        central.push(record);

        offset += 30 + name.length + entry.data.length;
    }

    const centralSize = central.reduce((sum, record) => sum + record.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...(central as BlobPart[]), end.buffer as ArrayBuffer], { type: "application/zip" });
}
