import Capacitor
import UIKit

/// The shell's bridge view controller (SceneDelegate and Main.storyboard both use it).
///
/// `CAPBridgeViewController.loadView()` creates the bridge, which injects Capacitor's core JS
/// and the auto-registered plugins as document-start WKUserScripts, and then calls
/// `capacitorDidLoad()`. The page itself is loaded later, from `viewDidLoad()` → `loadWebView()`.
/// Registering here therefore adds T3Native's `window.Capacitor.Plugins.T3Native` stubs (also a
/// document-start WKUserScript, via `JSExport.exportJS`) before the first navigation, so they
/// exist before any web app script runs.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(T3NativePlugin())
    }
}
