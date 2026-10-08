// Read statically by `denext mobile assets` / `denext mobile doctor` (denext never imports it):
// the Capacitor shell's icon and splash. The web app's own config is apps/web/denext.config.ts.
export default {
  mobile: {
    // The opaque 1024 square composited from the production Icon Composer source (README, icons).
    // The rounded production master (assets/prod/black-ios-1024.png) flattens to a visible inner
    // rim under the OS mask. backgroundColor (the Android adaptive layer) matches its black fill.
    icon: "assets/icon.png",
    backgroundColor: "#000000",
    // The web app's dark background (apps/web index.html), so the splash hands off to the boot shell.
    splashBackgroundColor: "#0a0a0a",
    darkBackgroundColor: "#0a0a0a",
  },
};
