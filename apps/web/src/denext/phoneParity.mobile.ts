// The iOS and Android exports' variant of ./phoneParity.ts: turns on the metrics where the
// phone build follows apps/mobile rather than the web app (phone-parity.css). The stylesheet
// is imported by main.tsx and scoped to this attribute because denext 3.4 drops a stylesheet
// that only a platform variant imports.
//
// It also registers DM Sans, apps/mobile's interface face (expo-font in its app.config.ts, the
// --font-sans / --font-medium / --font-bold tokens in its global.css): the same three weights,
// converted losslessly to WOFF2 from the @expo-google-fonts/dm-sans 0.4.2 TTFs that app bundles
// (full Latin and Latin Extended, as there). The files are imported here, so only the phone
// exports carry them; phone-parity.css puts the family first in --font-sans.
import dmSansBold from "./fonts/DMSans-Bold.woff2?url";
import dmSansMedium from "./fonts/DMSans-Medium.woff2?url";
import dmSansRegular from "./fonts/DMSans-Regular.woff2?url";
import { PHONE_PLATFORM } from "./phonePlatform";

/** apps/mobile's DM Sans faces: DMSans-Regular (400), DMSans-Medium (500), DMSans-Bold (700). */
const DM_SANS_FACES: ReadonlyArray<{ readonly weight: string; readonly url: string }> = [
  { weight: "400", url: dmSansRegular },
  { weight: "500", url: dmSansMedium },
  { weight: "700", url: dmSansBold },
];

if (typeof document !== "undefined") {
  document.documentElement.dataset.phoneParity = "";
  document.documentElement.dataset.phonePlatform = PHONE_PLATFORM;
  if (typeof FontFace !== "undefined" && document.fonts) {
    for (const { weight, url } of DM_SANS_FACES) {
      const face = new FontFace("DM Sans", `url(${url}) format("woff2")`, {
        weight,
        style: "normal",
        display: "swap",
      });
      document.fonts.add(face);
      // The files ship with the app: load them now, so the first paint already uses them.
      void face.load().catch(() => {});
    }
  }
}
