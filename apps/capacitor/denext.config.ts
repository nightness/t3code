// Read statically by `denext mobile assets` / `denext mobile doctor` (denext never imports it):
// the Capacitor shell's icon and splash. The web app's own config is apps/web/denext.config.ts.
export default {
  mobile: {
    // The production iOS master (black fill, rounded and transparent at the corners). denext
    // flattens it onto backgroundColor, which matches the fill, so the OS mask shows no seam.
    icon: "../../assets/prod/black-ios-1024.png",
    backgroundColor: "#000000",
    // The web app's dark background (apps/web index.html), so the splash hands off to the boot shell.
    splashBackgroundColor: "#0a0a0a",
    darkBackgroundColor: "#0a0a0a",
  },
};
