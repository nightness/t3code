// Which phone export this is, for phone-parity.css's per-platform rules (html[data-phone-platform]).
// The iOS export takes this file, the Android export ./phonePlatform.android.ts (denext's
// platform files); only phoneParity.mobile.ts reads it. apps/mobile's own per-platform
// files (e.g. features/threads/thread-list-v2-row-appearance.android.ts) are the precedent.
export const PHONE_PLATFORM: "ios" | "android" = "ios";
