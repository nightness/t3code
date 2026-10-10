import { describe, expect, it } from "vite-plus/test";

import { IS_PHONE_EXPORT } from "./phoneExport";
import { IS_PHONE_EXPORT as IS_PHONE_EXPORT_MOBILE } from "./phoneExport.mobile";

describe("phoneExport", () => {
  it("is false in the web and desktop builds and true in the phone exports", () => {
    expect(IS_PHONE_EXPORT).toBe(false);
    expect(IS_PHONE_EXPORT_MOBILE).toBe(true);
  });
});
