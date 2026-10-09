// The iOS and Android exports' variant of ./phoneParity.ts: turns on the metrics where the
// phone build follows apps/mobile rather than the web app (phone-parity.css). The stylesheet
// is imported by main.tsx and scoped to this attribute because denext 3.4 drops a stylesheet
// that only a platform variant imports.
if (typeof document !== "undefined") document.documentElement.dataset.phoneParity = "";
export {};
