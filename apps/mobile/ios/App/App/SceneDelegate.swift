import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()
        // denext:app-background begin (from the app config; `denext mobile add app-config`)
        let denextBackground = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 10 / 255, green: 10 / 255, blue: 10 / 255, alpha: 1)
                : UIColor(red: 255 / 255, green: 255 / 255, blue: 255 / 255, alpha: 1)
        }
        window?.backgroundColor = denextBackground
        if let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView {
            webView.isOpaque = false
            webView.backgroundColor = denextBackground
            webView.scrollView.backgroundColor = denextBackground
        }
        // denext:app-background end

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
