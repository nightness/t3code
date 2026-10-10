import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderUpdateLaunchNotification } from "./ProviderUpdateLaunchNotification.mobile";

describe("ProviderUpdateLaunchNotification (phone exports)", () => {
  it("raises no launch prompt, as apps/mobile keeps provider updates in Settings", () => {
    expect(renderToStaticMarkup(<ProviderUpdateLaunchNotification />)).toBe("");
  });
});
