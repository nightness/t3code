import AVFoundation
import UIKit

enum QRScanResult {
    case scanned(String)
    case cancelled
    case failed(String)
}

/// Full-screen camera preview that reports the first QR code it sees, or a cancel. It dismisses
/// itself and calls `completion` exactly once, on the main thread. Presented by T3NativePlugin.
final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.brainwires.t3code.qr-scanner")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var setupFailure: String?
    private var completion: ((QRScanResult) -> Void)?

    init(completion: @escaping (QRScanResult) -> Void) {
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        setupFailure = configureSession()
        if setupFailure == nil {
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.addSublayer(preview)
            previewLayer = preview
        }
        addOverlay()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        guard setupFailure == nil else { return }
        // startRunning() blocks until the camera is up, so keep it off the main thread.
        sessionQueue.async { [session] in
            if !session.isRunning {
                session.startRunning()
            }
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let failure = setupFailure {
            finish(.failed(failure))
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.layer.bounds
        if let connection = previewLayer?.connection,
           connection.isVideoOrientationSupported,
           let interfaceOrientation = view.window?.windowScene?.interfaceOrientation,
           let videoOrientation = AVCaptureVideoOrientation(rawValue: interfaceOrientation.rawValue) {
            connection.videoOrientation = videoOrientation
        }
    }

    /// Returns a user-facing reason when the camera cannot be used for scanning.
    private func configureSession() -> String? {
        guard let device = AVCaptureDevice.default(for: .video) else {
            return "No camera is available on this device."
        }
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else {
                return "The camera could not be used for scanning."
            }
            session.addInput(input)
        } catch {
            return "The camera could not be opened: \(error.localizedDescription)"
        }

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            return "The camera could not be used for scanning."
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        guard output.availableMetadataObjectTypes.contains(.qr) else {
            return "This camera cannot scan QR codes."
        }
        output.metadataObjectTypes = [.qr]
        return nil
    }

    private func addOverlay() {
        var cancelConfiguration = UIButton.Configuration.filled()
        cancelConfiguration.title = "Cancel"
        cancelConfiguration.baseForegroundColor = .white
        cancelConfiguration.baseBackgroundColor = UIColor.black.withAlphaComponent(0.55)
        cancelConfiguration.cornerStyle = .capsule
        cancelConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16)
        let cancelButton = UIButton(configuration: cancelConfiguration)
        cancelButton.accessibilityLabel = "Cancel scanning"
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)

        let hint = UILabel()
        hint.text = "Point the camera at the QR code from t3 pair."
        hint.textColor = .white
        hint.font = .preferredFont(forTextStyle: .body)
        hint.adjustsFontForContentSizeCategory = true
        hint.textAlignment = .center
        hint.numberOfLines = 0
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            cancelButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            hint.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            hint.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            hint.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -24)
        ])
    }

    @objc private func cancelTapped() {
        finish(.cancelled)
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard completion != nil else { return }
        let value = metadataObjects
            .compactMap { $0 as? AVMetadataMachineReadableCodeObject }
            .first { $0.type == .qr && !($0.stringValue ?? "").isEmpty }?
            .stringValue
        guard let value = value else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(.scanned(value))
    }

    private func finish(_ result: QRScanResult) {
        guard let completion = completion else { return }
        self.completion = nil
        stopSession()
        completion(result)
        dismiss(animated: true)
    }

    private func stopSession() {
        sessionQueue.async { [session] in
            if session.isRunning {
                session.stopRunning()
            }
        }
    }
}
