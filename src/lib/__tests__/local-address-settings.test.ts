import { describe, expect, it } from "vitest";
import { findLocalAddressSettings } from "../local-address-settings";

describe("findLocalAddressSettings", () => {
    it("finds a localhost address in map form", () => {
        expect(findLocalAddressSettings("x:\n  environment:\n    FRONTEND_URL: http://localhost:3000\n    NODE_ENV: production\n")).toEqual(["FRONTEND_URL"]);
    });
    it("finds list form, quoted values and 127.0.0.1", () => {
        expect(findLocalAddressSettings('environment:\n  - APP_URL=http://127.0.0.1:8080\n  - "SITE_URL=http://localhost"\nBASE_URL: "http://localhost:4000/"')).toEqual(["APP_URL", "BASE_URL", "SITE_URL"]);
    });
    it("leaves databases, caches and other servers alone", () => {
        expect(findLocalAddressSettings("DATABASE_URL: http://localhost:5432\nREDIS_URL: http://localhost:6379\nSMTP_HOST: http://localhost\nPOSTGRES_HOST: http://localhost")).toEqual([]);
    });
    it("ignores real addresses and non-address names", () => {
        expect(findLocalAddressSettings("FRONTEND_URL: https://app.example.com\nPORT: http://localhost:3000\nDEBUG: true")).toEqual([]);
    });
    it("returns nothing for text with no settings", () => {
        expect(findLocalAddressSettings("")).toEqual([]);
    });
});
