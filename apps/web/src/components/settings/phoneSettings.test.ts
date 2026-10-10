import { describe, expect, it } from "vite-plus/test";

import { shouldRedirectSettingsIndex, usePhoneSettings } from "./phoneSettings";

describe("phoneSettings (web and desktop)", () => {
  it("keeps the sidebar settings layout and the redirect to the first section", () => {
    expect(usePhoneSettings()).toBe(false);
    expect(shouldRedirectSettingsIndex()).toBe(true);
  });
});
