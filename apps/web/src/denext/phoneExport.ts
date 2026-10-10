// Whether this build is a phone export (the iOS or Android target). The web and desktop builds
// take this file; the iOS and Android exports resolve ./phoneExport.mobile.ts (denext's platform
// files). For behaviour apps/mobile lacks altogether and the phone build leaves out, such as
// hover tooltips and keyboard-shortcut hints (React Native has neither).
export const IS_PHONE_EXPORT: boolean = false;
