import AVFoundation
import Capacitor
import Foundation
import Security
import UIKit

/// App-local Capacitor plugin, reached from the web app as `window.Capacitor.Plugins.T3Native`
/// (typed in apps/web/src/nativeShell.ts). MainViewController registers it in
/// `capacitorDidLoad()`, before the page loads, so its JS stubs exist before any app script runs.
///
/// - `keychainGet({ key }) → { value: string | null }`
/// - `keychainSet({ key, value }) → {}`
/// - `keychainRemove({ key }) → {}`
/// - `scanQRCode() → { value: string }`, rejecting with code `"cancelled"` or `"denied"`
@objc(T3NativePlugin)
public class T3NativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T3NativePlugin"
    public let jsName = "T3Native"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keychainGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keychainSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keychainRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanQRCode", returnType: CAPPluginReturnPromise)
    ]

    private static let keychainService = "com.brainwires.t3code"

    /// The scanner currently on screen, so a second call cannot stack another one.
    private weak var activeScanner: QRScannerViewController?

    // MARK: - Keychain

    /// Generic-password items scoped to this app's service, one per key.
    private func keychainQuery(for key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: T3NativePlugin.keychainService,
            kSecAttrAccount as String: key
        ]
    }

    private func requireKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("A non-empty key is required.", "invalid")
            return nil
        }
        return key
    }

    private func rejectKeychain(_ call: CAPPluginCall, _ operation: String, _ status: OSStatus) {
        let detail = (SecCopyErrorMessageString(status, nil) as String?) ?? "Unknown error"
        call.reject(
            "Keychain \(operation) failed: \(detail) (OSStatus \(status)).",
            "keychain",
            nil,
            ["status": Int(status)]
        )
    }

    @objc func keychainGet(_ call: CAPPluginCall) {
        guard let key = requireKey(call) else { return }
        var query = keychainQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                call.reject("The Keychain item is not UTF-8 text.", "keychain")
                return
            }
            call.resolve(["value": value])
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        default:
            rejectKeychain(call, "read", status)
        }
    }

    /// Update-or-add. `AfterFirstUnlockThisDeviceOnly` keeps the item out of backups and device
    /// migration and leaves it readable in the background once the device has been unlocked.
    @objc func keychainSet(_ call: CAPPluginCall) {
        guard let key = requireKey(call) else { return }
        guard let value = call.getString("value") else {
            call.reject("A string value is required.", "invalid")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        var status = SecItemUpdate(keychainQuery(for: key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let item = keychainQuery(for: key).merging(attributes) { _, new in new }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            rejectKeychain(call, "write", status)
        }
    }

    @objc func keychainRemove(_ call: CAPPluginCall) {
        guard let key = requireKey(call) else { return }
        let status = SecItemDelete(keychainQuery(for: key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            rejectKeychain(call, "delete", status)
        }
    }

    // MARK: - QR scanner

    @objc func scanQRCode(_ call: CAPPluginCall) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentScanner(for: call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard granted else {
                    call.reject("Camera access was denied.", "denied")
                    return
                }
                self?.presentScanner(for: call)
            }
        default:
            // .denied or .restricted: only the Settings app can turn it back on.
            call.reject("Camera access is turned off for T3 Code.", "denied")
        }
    }

    private func presentScanner(for call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.activeScanner == nil else {
                call.reject("A QR scan is already in progress.", "busy")
                return
            }
            guard var presenter = self.bridge?.viewController else {
                call.reject("There is no screen to show the scanner on.", "unavailable")
                return
            }
            while let presented = presenter.presentedViewController {
                presenter = presented
            }

            let scanner = QRScannerViewController { result in
                switch result {
                case .scanned(let value):
                    call.resolve(["value": value])
                case .cancelled:
                    call.reject("The QR scan was cancelled.", "cancelled")
                case .failed(let message):
                    call.reject(message, "unavailable")
                }
            }
            scanner.modalPresentationStyle = .fullScreen
            self.activeScanner = scanner
            presenter.present(scanner, animated: true)
        }
    }
}
