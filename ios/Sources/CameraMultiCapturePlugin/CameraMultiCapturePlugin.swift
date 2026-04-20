import AVFoundation
import Capacitor
import Foundation
import Photos
import BackgroundTasks

struct CameraConfig {
    var x: CGFloat
    var y: CGFloat
    var width: CGFloat
    var height: CGFloat
    var cameraPosition: AVCaptureDevice.Position
    var quality: AVCaptureSession.Preset
    var zoom: CGFloat
    var jpegQuality: CGFloat
    var autoFocus: Bool
    var orientation: AVCaptureVideoOrientation
    var flashMode: AVCaptureDevice.FlashMode
}

@objc(CameraMultiCapturePlugin)
public class CameraMultiCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CameraMultiCapturePlugin"
    public let jsName = "CameraMultiCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startVideoRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopVideoRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePreviewRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFlash", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFlash", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTorch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTorch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailableZoomLevels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailableCameras", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchToPhysicalCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueBackgroundUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUploadStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVersion", returnType: CAPPluginReturnPromise),
    ]

    var captureSession: AVCaptureSession?
    var currentInput: AVCaptureDeviceInput?
    var photoOutput: AVCapturePhotoOutput?
    var movieOutput: AVCaptureMovieFileOutput?
    var previewLayer: AVCaptureVideoPreviewLayer?
    var cameraPreviewView: UIView?
    var cameraPosition: AVCaptureDevice.Position = .back
    var currentFlashMode: AVCaptureDevice.FlashMode = .off
    var currentOrientation: AVCaptureVideoOrientation = .portrait
    let sessionQueue = DispatchQueue(label: "camera.session.queue")
    var captureDelegate: PhotoCaptureDelegate?
    var videoCaptureDelegate: VideoCaptureDelegate?
    var pendingVideoStopCall: CAPPluginCall?
    var autoStoppedVideoResult: [String: Any]?
    var maxRecordingDurationSeconds: Double = 0
    var enableSaving: Bool = false
    var galleryAlbumName: String = "Camera"
    var isUsingVirtualDevice: Bool = false
    // Divisor to convert between API zoom factors and user-facing values.
    // On triple-camera virtual devices (e.g. iPhone 15 Pro), the API scale
    // starts at 1.0 for ultrawide, with switchover at [2, 6]. The first
    // switchover factor (2) represents "1x" (wide), so we divide API values
    // by 2 to get user-facing labels: 0.5x, 1x, 3x.
    // On devices without ultrawide, this stays 1.0 (no conversion needed).
    var zoomScaleDivisor: CGFloat = 1.0



    private func detectCurrentOrientation() -> AVCaptureVideoOrientation {
        switch UIDevice.current.orientation {
        case .portrait:
            return .portrait
        case .portraitUpsideDown:
            return .portraitUpsideDown
        case .landscapeLeft:
            return .landscapeRight
        case .landscapeRight:
            return .landscapeLeft
        default:
            if #available(iOS 13.0, *) {
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                    switch windowScene.interfaceOrientation {
                    case .portrait:
                        return .portrait
                    case .portraitUpsideDown:
                        return .portraitUpsideDown
                    case .landscapeLeft:
                        return .landscapeRight
                    case .landscapeRight:
                        return .landscapeLeft
                    default:
                        return .portrait
                    }
                }
            }
            return .portrait
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        print("Received data from JS: \(call.dictionaryRepresentation)")

        // Check camera permission before starting
        let cameraAuthStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if cameraAuthStatus != .authorized {
            call.reject("Camera permission not granted. Please call requestPermissions() first.")
            return
        }

        guard let previewRect = call.getObject("previewRect") else {
            call.reject("Missing previewRect")
            return
        }

        let x = CGFloat((previewRect["x"] as? NSNumber)?.floatValue ?? 0)
        let y = CGFloat((previewRect["y"] as? NSNumber)?.floatValue ?? 0)
        let width = CGFloat(
            (previewRect["width"] as? NSNumber)?.floatValue ?? Float(UIScreen.main.bounds.width))
        let height = CGFloat(
            (previewRect["height"] as? NSNumber)?.floatValue ?? Float(UIScreen.main.bounds.height))

        let position =
            (call.getString("cameraPosition") == "front") ? AVCaptureDevice.Position.front : .back
        let qualityName = call.getString("captureMode") ?? "high"
        let qualityPreset: AVCaptureSession.Preset = (qualityName == "low") ? .medium : .high
        let zoom = CGFloat(call.getFloat("zoom") ?? 1.0)
        let jpegQuality = CGFloat(call.getFloat("jpegQuality") ?? 0.8)
        let autofocus = call.getBool("autoFocus") ?? true
        let maxRecordingDuration = Double(call.getFloat("maxRecordingDuration") ?? 0)

        let orientation: AVCaptureVideoOrientation
        if let rotation = call.getInt("rotation") {
            switch rotation {
            case 90: orientation = .landscapeRight
            case 180: orientation = .portraitUpsideDown
            case 270: orientation = .landscapeLeft
            default: orientation = .portrait
            }
        } else {
            orientation = detectCurrentOrientation()
        }
        
        let flashModeString = call.getString("flash") ?? "off"
        let flashMode: AVCaptureDevice.FlashMode
        switch flashModeString {
        case "on": flashMode = .on
        case "auto": flashMode = .auto
        default: flashMode = .off
        }

        let config = CameraConfig(
            x: x, y: y, width: width, height: height,
            cameraPosition: position, quality: qualityPreset,
            zoom: zoom, jpegQuality: jpegQuality, autoFocus: autofocus,
            orientation: orientation, flashMode: flashMode
        )
        self.cameraPosition = config.cameraPosition
        self.currentFlashMode = config.flashMode
        self.currentOrientation = config.orientation
        self.maxRecordingDurationSeconds = maxRecordingDuration > 0 ? maxRecordingDuration : 0
        self.enableSaving = call.getBool("enableSaving") ?? false
        self.galleryAlbumName = call.getString("galleryAlbumName") ?? "Camera"

        self.sessionQueue.async {
            do {
                try self.configureSession(with: config, call: call)
                DispatchQueue.main.async {
                    call.resolve()
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject(
                        "Camera configuration failed: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let device = self.currentInput?.device, device.hasTorch, device.torchMode != .off {
                do {
                    try device.lockForConfiguration()
                    device.torchMode = .off
                    device.unlockForConfiguration()
                } catch { /* best effort */ }
            }

            if self.movieOutput?.isRecording == true {
                self.movieOutput?.stopRecording()
            }
            self.captureSession?.stopRunning()
            self.previewLayer?.removeFromSuperlayer()
            self.captureSession = nil
            self.currentInput = nil
            self.photoOutput = nil
            self.movieOutput = nil
            self.videoCaptureDelegate = nil
            self.pendingVideoStopCall = nil
            self.autoStoppedVideoResult = nil
            self.isUsingVirtualDevice = false

            // Restore webView background after camera preview is removed
            if let webView = self.bridge?.webView {
                webView.isOpaque = true
                webView.backgroundColor = nil
                webView.scrollView.backgroundColor = nil
                webView.layer.backgroundColor = nil
                webView.evaluateJavaScript("document.documentElement.style.backgroundColor = ''", completionHandler: nil)
            }

            call.resolve()
        }
    }

    @objc func capture(_ call: CAPPluginCall) {
        guard let session = captureSession, photoOutput != nil else {
            call.reject("Camera not initialized")
            return
        }
        
        if !session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async {
                session.startRunning()
                DispatchQueue.main.async {
                    self.performCapture(call)
                }
            }
            return
        }
        
        performCapture(call)
    }
    
    private func performCapture(_ call: CAPPluginCall) {
        guard let photoOutput = photoOutput else {
            call.reject("Photo output not initialized")
            return
        }

        // Turn off torch before capture when flash is enabled; the LED is shared
        // hardware so an active torch prevents the flash from firing correctly.
        if currentFlashMode != .off,
           let device = currentInput?.device, device.hasTorch, device.torchMode == .on {
            do {
                try device.lockForConfiguration()
                device.torchMode = .off
                device.unlockForConfiguration()
            } catch {
                print("[CameraMultiCapture] Failed to turn off torch before flash capture: \(error)")
            }
        }

        let resultType = call.getString("resultType") ?? "base64"
        let settings = AVCapturePhotoSettings()
        settings.isHighResolutionPhotoEnabled = photoOutput.isHighResolutionCaptureEnabled
        
        // Apply flash settings
        if photoOutput.supportedFlashModes.contains(currentFlashMode) {
            settings.flashMode = currentFlashMode
        }
        
        // Set photo orientation to match current preview orientation
        if let connection = photoOutput.connection(with: .video) {
            connection.videoOrientation = currentOrientation
            // Prevent front camera from capturing mirrored images
            if self.cameraPosition == .front {
                connection.isVideoMirrored = false
            }
        }
        
        let delegate = PhotoCaptureDelegate(plugin: self, call: call, resultType: resultType, isFrontCamera: cameraPosition == .front, enableSaving: enableSaving, galleryAlbumName: galleryAlbumName)
        self.captureDelegate = delegate

        photoOutput.capturePhoto(with: settings, delegate: delegate)
    }

    @objc func startVideoRecording(_ call: CAPPluginCall) {
        let audioAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        if audioAuthStatus == .denied || audioAuthStatus == .restricted {
            call.reject("Microphone permission denied. Please enable microphone access in Settings.")
            return
        }
        if audioAuthStatus == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async {
                    if granted {
                        self.startVideoRecordingInternal(call)
                    } else {
                        call.reject("Microphone permission denied.")
                    }
                }
            }
            return
        }

        startVideoRecordingInternal(call)
    }

    private func startVideoRecordingInternal(_ call: CAPPluginCall) {
        guard let movieOutput = movieOutput else {
            call.reject("Video output not initialized")
            return
        }
        guard !movieOutput.isRecording else {
            call.reject("Video recording is already in progress")
            return
        }

        currentOrientation = detectCurrentOrientation()
        if let videoConnection = movieOutput.connection(with: .video) {
            videoConnection.videoOrientation = currentOrientation
            if cameraPosition == .front {
                videoConnection.isVideoMirrored = false
            }
        }

        if maxRecordingDurationSeconds > 0 {
            movieOutput.maxRecordedDuration = CMTime(
                seconds: maxRecordingDurationSeconds,
                preferredTimescale: 600
            )
        } else {
            movieOutput.maxRecordedDuration = .invalid
        }

        let tempDir = FileManager.default.temporaryDirectory
        let fileName = UUID().uuidString + ".mp4"
        let fileURL = tempDir.appendingPathComponent(fileName)

        if currentFlashMode == .on, let device = currentInput?.device, device.hasTorch, device.isTorchAvailable {
            do {
                try device.lockForConfiguration()
                device.torchMode = .on
                device.unlockForConfiguration()
            } catch {
                print("[CameraMultiCapture] Failed to enable torch for video recording: \(error)")
            }
        }

        let delegate = VideoCaptureDelegate { [weak self] outputURL, error in
            self?.handleVideoRecordingFinished(outputURL: outputURL, error: error)
        }
        self.videoCaptureDelegate = delegate
        movieOutput.startRecording(to: fileURL, recordingDelegate: delegate)
        call.resolve()
    }

    @objc func stopVideoRecording(_ call: CAPPluginCall) {
        // If recording was already auto-stopped (e.g. by maxRecordingDuration),
        // return the buffered result immediately.
        if let buffered = autoStoppedVideoResult {
            autoStoppedVideoResult = nil
            call.resolve(buffered)
            return
        }

        guard let movieOutput = movieOutput else {
            call.reject("Video output not initialized")
            return
        }
        guard movieOutput.isRecording else {
            call.reject("No active video recording to stop")
            return
        }

        pendingVideoStopCall = call
        movieOutput.stopRecording()
    }

    private func handleVideoRecordingFinished(outputURL: URL, error: Error?) {
        if let device = currentInput?.device, device.hasTorch, device.torchMode != .off {
            do {
                try device.lockForConfiguration()
                device.torchMode = .off
                device.unlockForConfiguration()
            } catch { /* best effort */ }
        }

        defer { videoCaptureDelegate = nil }

        if let error = error {
            if let call = pendingVideoStopCall {
                pendingVideoStopCall = nil
                call.reject("Video recording failed: \(error.localizedDescription)")
            }
            return
        }

        let thumbnail = generateVideoThumbnail(from: outputURL, size: 200) ?? ""
        let duration = getVideoDuration(from: outputURL)

        if enableSaving {
            saveVideoToGallery(fileURL: outputURL)
        }

        let result: [String: Any] = [
            "value": [
                "uri": outputURL.absoluteString,
                "thumbnail": thumbnail,
                "duration": duration
            ]
        ]

        if let call = pendingVideoStopCall {
            pendingVideoStopCall = nil
            call.resolve(result)
        } else {
            // Recording was auto-stopped by maxRecordedDuration.
            // Buffer the result for the next stopVideoRecording call.
            autoStoppedVideoResult = result
        }
    }

    private func saveVideoToGallery(fileURL: URL) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: fileURL, options: nil)
        }) { success, error in
            if let error = error {
                print("[CameraMultiCapture] Failed to save video to gallery: \(error.localizedDescription)")
            }
        }
    }

    @objc func setZoom(_ call: CAPPluginCall) {
        guard let input = currentInput else {
            call.reject("Camera not initialized")
            return
        }
        let userZoom = CGFloat(call.getFloat("zoom") ?? 1.0)
        // Convert user-facing zoom value back to API scale
        let zoomFactor = userZoom * zoomScaleDivisor
        do {
            try input.device.lockForConfiguration()
            // Clamp zoom factor to valid range
            let minZoom = input.device.minAvailableVideoZoomFactor
            let maxZoom = input.device.activeFormat.videoMaxZoomFactor
            input.device.videoZoomFactor = max(minZoom, min(zoomFactor, maxZoom))
            input.device.unlockForConfiguration()
            // Return the user-facing zoom value
            call.resolve(["zoom": Float(input.device.videoZoomFactor / zoomScaleDivisor)])
        } catch {
            call.reject("Failed to set zoom: \(error.localizedDescription)")
        }
    }

    @objc func getAvailableZoomLevels(_ call: CAPPluginCall) {
        guard let input = currentInput else {
            call.reject("Camera not initialized")
            return
        }
        
        let device = input.device
        // Convert API zoom range to user-facing values
        let minZoom = device.minAvailableVideoZoomFactor / zoomScaleDivisor
        let maxZoom = device.activeFormat.videoMaxZoomFactor / zoomScaleDivisor

        // Generate suggested preset levels based on device capabilities
        var presetLevels: [Float] = []

        // Add ultra-wide if available (0.5x or 0.7x depending on device)
        let userMin = Float(minZoom)
        if userMin < 1.0 {
            let ultraWide: Float
            if userMin > 0.6 && userMin < 0.8 {
                ultraWide = 0.7
            } else if userMin < 0.6 {
                ultraWide = 0.5
            } else {
                ultraWide = userMin
            }
            presetLevels.append(ultraWide)
        }

        // Always add 1x
        presetLevels.append(1.0)

        // Add telephoto presets based on max zoom
        if maxZoom >= 2.0 {
            presetLevels.append(2.0)
        }
        if maxZoom >= 3.0 {
            presetLevels.append(3.0)
        }
        if maxZoom >= 5.0 {
            presetLevels.append(5.0)
        }
        if maxZoom >= 10.0 {
            presetLevels.append(10.0)
        }

        call.resolve([
            "minZoom": Float(minZoom),
            "maxZoom": Float(maxZoom),
            "presetLevels": presetLevels
        ])
    }

    @objc func switchCamera(_ call: CAPPluginCall) {
        guard let session = captureSession,
              let currentInput = currentInput
        else {
            call.reject("Camera not initialized")
            return
        }

        if movieOutput?.isRecording == true {
            call.reject("Cannot switch camera while recording")
            return
        }

        // Turn off torch on the current device before switching cameras
        let device = currentInput.device
        if device.hasTorch && device.torchMode == .on {
            do {
                try device.lockForConfiguration()
                device.torchMode = .off
                device.unlockForConfiguration()
            } catch {
                // Ignore failure here; we are switching cameras anyway
            }
        }

        session.beginConfiguration()
        session.removeInput(currentInput)
        self.cameraPosition = (self.cameraPosition == .back) ? .front : .back

        do {
            // Re-select a virtual device for the back camera to preserve
            // seamless zoom across all physical lenses
            var newDevice: AVCaptureDevice? = nil
            if self.cameraPosition == .back {
                let virtualDeviceTypes: [AVCaptureDevice.DeviceType] = [
                    .builtInTripleCamera,
                    .builtInDualWideCamera,
                    .builtInDualCamera
                ]
                for deviceType in virtualDeviceTypes {
                    if let device = AVCaptureDevice.default(deviceType, for: .video, position: .back) {
                        newDevice = device
                        self.isUsingVirtualDevice = true
                        // Recompute zoom scale divisor for the new device
                        let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors
                        if switchOvers.count > 0 && device.minAvailableVideoZoomFactor >= 1.0 {
                            self.zoomScaleDivisor = CGFloat(switchOvers[0].floatValue)
                        } else {
                            self.zoomScaleDivisor = 1.0
                        }
                        break
                    }
                }
            }

            // Fallback to wide-angle (also used for front camera)
            if newDevice == nil {
                newDevice = AVCaptureDevice.default(
                    .builtInWideAngleCamera, for: .video, position: self.cameraPosition)
                self.isUsingVirtualDevice = false
                self.zoomScaleDivisor = 1.0
            }

            guard let device = newDevice else {
                session.commitConfiguration()
                call.reject("Desired camera not available")
                return
            }

            let newInput = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(newInput) {
                session.addInput(newInput)
                self.currentInput = newInput
                session.commitConfiguration()
                call.resolve()
            } else {
                session.commitConfiguration()
                call.reject("Cannot add new camera input")
            }
        } catch {
            session.commitConfiguration()
            call.reject("Switch camera error: \(error.localizedDescription)")
        }
    }
    
    @objc func getAvailableCameras(_ call: CAPPluginCall) {
        // Check for available cameras on the current position
        let hasUltrawide = AVCaptureDevice.default(
            .builtInUltraWideCamera, for: .video, position: cameraPosition
        ) != nil

        let hasWide = AVCaptureDevice.default(
            .builtInWideAngleCamera, for: .video, position: cameraPosition
        ) != nil

        let hasTelephoto = AVCaptureDevice.default(
            .builtInTelephotoCamera, for: .video, position: cameraPosition
        ) != nil

        var result = [String: Any]()
        result["hasUltrawide"] = hasUltrawide
        result["hasWide"] = hasWide
        result["hasTelephoto"] = hasTelephoto

        // Derive user-facing zoom factors from the virtual device's switch-over points.
        // On triple-camera devices (e.g. iPhone 15 Pro), the API zoom scale is:
        //   1.0 = ultrawide, switchOverFactors = [2, 6]
        //   meaning UW→W at API 2.0, W→Tele at API 6.0
        // Apple's Camera app normalizes by dividing by the first switchover
        // so users see 0.5x, 1x, 3x. We do the same.
        if let device = currentInput?.device,
           isUsingVirtualDevice {
            let switchOverFactors = device.virtualDeviceSwitchOverVideoZoomFactors

            // The first switchover factor is the API zoom value for the wide lens ("1x").
            // We divide all API values by this to get user-facing labels.
            if hasUltrawide && switchOverFactors.count > 0 {
                let wideApiZoom = CGFloat(switchOverFactors[0].floatValue)
                self.zoomScaleDivisor = wideApiZoom

                let minApiZoom = device.minAvailableVideoZoomFactor
                result["ultrawideZoomFactor"] = Float(minApiZoom / wideApiZoom)
            } else if hasUltrawide {
                self.zoomScaleDivisor = 1.0
                result["ultrawideZoomFactor"] = 0.5
            } else {
                self.zoomScaleDivisor = 1.0
            }

            result["wideZoomFactor"] = 1.0

            if hasTelephoto && switchOverFactors.count > 0 {
                let teleApiZoom = CGFloat(switchOverFactors.last!.floatValue)
                result["telephotoZoomFactor"] = Float(teleApiZoom / self.zoomScaleDivisor)
            } else if hasTelephoto {
                result["telephotoZoomFactor"] = 2.0
            }
        } else {
            self.zoomScaleDivisor = 1.0
            // Fallback for non-virtual device sessions
            if hasUltrawide {
                result["ultrawideZoomFactor"] = 0.5
            }
            result["wideZoomFactor"] = 1.0
            if hasTelephoto {
                result["telephotoZoomFactor"] = 2.0
            }
        }

        call.resolve(result)
    }
    
    @objc func switchToPhysicalCamera(_ call: CAPPluginCall) {
        guard let input = currentInput,
              let userZoomFactor = call.getFloat("zoomFactor") else {
            call.reject("Camera not initialized or missing zoomFactor parameter")
            return
        }

        // When using a virtual device, simply set the zoom factor.
        // iOS automatically activates the correct physical camera at the right
        // switch-over points. No need to swap device inputs.
        if isUsingVirtualDevice {
            do {
                let device = input.device
                // Convert user-facing zoom value back to API scale
                let apiZoom = CGFloat(userZoomFactor) * zoomScaleDivisor
                try device.lockForConfiguration()
                let clampedZoom = max(
                    device.minAvailableVideoZoomFactor,
                    min(apiZoom, device.activeFormat.videoMaxZoomFactor)
                )
                device.videoZoomFactor = clampedZoom
                device.unlockForConfiguration()
                // Return user-facing zoom value
                call.resolve(["zoom": Float(clampedZoom / zoomScaleDivisor)])
            } catch {
                call.reject("Failed to set zoom: \(error.localizedDescription)")
            }
            return
        }

        if movieOutput?.isRecording == true {
            call.reject("Cannot switch camera while recording")
            return
        }

        // Fallback: manually switch physical cameras for non-virtual device sessions
        guard let session = captureSession else {
            call.reject("Camera session not available")
            return
        }

        let deviceType: AVCaptureDevice.DeviceType
        if userZoomFactor < 1.0 {
            deviceType = .builtInUltraWideCamera
        } else if userZoomFactor >= 2.0 {
            deviceType = .builtInTelephotoCamera
        } else {
            deviceType = .builtInWideAngleCamera
        }

        guard let newDevice = AVCaptureDevice.default(
            deviceType, for: .video, position: cameraPosition
        ) else {
            guard let fallbackDevice = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: cameraPosition
            ) else {
                call.reject("No suitable camera available")
                return
            }
            switchToDevice(fallbackDevice, in: session, call: call)
            return
        }

        switchToDevice(newDevice, in: session, call: call)
    }

    private func switchToDevice(_ device: AVCaptureDevice, in session: AVCaptureSession, call: CAPPluginCall) {
        session.beginConfiguration()

        // Remove current input
        if let currentInput = currentInput {
            session.removeInput(currentInput)
        }

        do {
            let newInput = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(newInput) {
                session.addInput(newInput)
                self.currentInput = newInput

                session.commitConfiguration()
                call.resolve()
            } else {
                session.commitConfiguration()
                call.reject("Cannot add new camera input")
            }
        } catch {
            session.commitConfiguration()
            call.reject("Failed to switch camera: \(error.localizedDescription)")
        }
    }

    @objc func updatePreviewRect(_ call: CAPPluginCall) {
           guard let previewRect = call.getObject("previewRect") ?? (call.options as? JSObject) else {
            call.reject("Missing previewRect")
            return
        }

        let x = CGFloat((previewRect["x"] as? NSNumber)?.floatValue ?? 0)
        let y = CGFloat((previewRect["y"] as? NSNumber)?.floatValue ?? 0)
        let width = CGFloat(
            (previewRect["width"] as? NSNumber)?.floatValue ?? Float(UIScreen.main.bounds.width))
        let height = CGFloat(
            (previewRect["height"] as? NSNumber)?.floatValue ?? Float(UIScreen.main.bounds.height))

        DispatchQueue.main.async {
            if let previewView = self.cameraPreviewView, let videoLayer = self.previewLayer {
                previewView.frame = CGRect(x: x, y: y, width: width, height: height)
                videoLayer.frame = previewView.bounds
                
                if call.getInt("rotation") == nil {
                    let newOrientation = self.detectCurrentOrientation()
                    videoLayer.connection?.videoOrientation = newOrientation
                    self.currentOrientation = newOrientation
                } else {
                    let rotation = call.getInt("rotation") ?? 0
                    let newOrientation: AVCaptureVideoOrientation
                    switch rotation {
                    case 90: newOrientation = .landscapeRight
                    case 180: newOrientation = .portraitUpsideDown
                    case 270: newOrientation = .landscapeLeft
                    default: newOrientation = .portrait
                    }
                    
                    videoLayer.connection?.videoOrientation = newOrientation
                    self.currentOrientation = newOrientation
                }
                
                call.resolve()
            } else {
                call.reject("Preview view not initialized")
            }
        }
    }

    func configureSession(with config: CameraConfig, call: CAPPluginCall) throws {
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = config.quality

        // Prefer virtual multi-camera device for seamless zoom across all lenses.
        // Virtual devices expose a single continuous zoom scale where iOS
        // automatically switches physical cameras at the correct switch-over points.
        let camera: AVCaptureDevice
        let virtualDeviceTypes: [AVCaptureDevice.DeviceType] = [
            .builtInTripleCamera,
            .builtInDualWideCamera,
            .builtInDualCamera
        ]
        var foundVirtualDevice: AVCaptureDevice? = nil
        for deviceType in virtualDeviceTypes {
            if let device = AVCaptureDevice.default(deviceType, for: .video, position: config.cameraPosition) {
                foundVirtualDevice = device
                break
            }
        }
        if let virtualDevice = foundVirtualDevice {
            camera = virtualDevice
            self.isUsingVirtualDevice = true
            // Compute zoom scale divisor from switchover factors
            let switchOvers = virtualDevice.virtualDeviceSwitchOverVideoZoomFactors
            if switchOvers.count > 0 && virtualDevice.minAvailableVideoZoomFactor >= 1.0 {
                // First switchover = the "1x" wide lens in API zoom scale
                self.zoomScaleDivisor = CGFloat(switchOvers[0].floatValue)
            } else {
                self.zoomScaleDivisor = 1.0
            }
        } else if let wideCamera = AVCaptureDevice.default(
            .builtInWideAngleCamera, for: .video, position: config.cameraPosition) {
            camera = wideCamera
            self.isUsingVirtualDevice = false
        } else {
            throw NSError(
                domain: "Camera", code: 0,
                userInfo: [NSLocalizedDescriptionKey: "Camera not available"])
        }

        let input = try AVCaptureDeviceInput(device: camera)
        if session.canAddInput(input) {
            session.addInput(input)
            self.currentInput = input
        } else {
            throw NSError(
                domain: "Camera", code: 0,
                userInfo: [NSLocalizedDescriptionKey: "Unable to add camera input"])
        }

        let photoOut = AVCapturePhotoOutput()
        if session.canAddOutput(photoOut) {
            session.addOutput(photoOut)
            photoOut.isHighResolutionCaptureEnabled = true
            self.photoOutput = photoOut
        }

        let movieOut = AVCaptureMovieFileOutput()
        if session.canAddOutput(movieOut) {
            session.addOutput(movieOut)
            self.movieOutput = movieOut
        }
        session.commitConfiguration()
        self.captureSession = session

        do {
            try camera.lockForConfiguration()
            // Convert user-facing zoom to API scale
            camera.videoZoomFactor = config.zoom * zoomScaleDivisor
            if config.autoFocus && camera.isFocusModeSupported(.continuousAutoFocus) {
                camera.focusMode = .continuousAutoFocus
            } else if camera.isFocusModeSupported(.locked) {
                camera.focusMode = .locked
            }
            camera.unlockForConfiguration()
        } catch {
            print("Focus/zoom config error: \(error)")
        }

        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                return
            }

            let previewView = UIView(
                frame: CGRect(x: 0, y: 0, width: config.width, height: config.height))
                
            webView.isOpaque = false
            webView.backgroundColor = UIColor.clear
            webView.scrollView.backgroundColor = UIColor.clear
            webView.layer.backgroundColor = UIColor.clear.cgColor
            
            let javascript = "document.documentElement.style.backgroundColor = 'transparent'"
            webView.evaluateJavaScript(javascript) { (_, error) in
                if let error = error {
                    print("[CameraMultiCapture] JS evaluation error: \(error)")
                }
            }
            
            // Add camera preview to webView's scrollView and send to back
            // This ensures camera is behind the web content
            webView.scrollView.addSubview(previewView)
            webView.scrollView.sendSubviewToBack(previewView)
            
            // Position the preview view correctly within the scrollView
            previewView.frame = CGRect(x: config.x, y: config.y, width: config.width, height: config.height)

            let videoLayer = AVCaptureVideoPreviewLayer(session: session)
            videoLayer.frame = previewView.bounds
            videoLayer.videoGravity = .resizeAspectFill
            videoLayer.connection?.videoOrientation = config.orientation
            previewView.layer.addSublayer(videoLayer)
            self.previewLayer = videoLayer
            self.cameraPreviewView = previewView

            if let parentView = webView.superview {
                parentView.bringSubviewToFront(webView)
            }

            DispatchQueue.global(qos: .userInitiated).async {
                self.captureSession?.startRunning()
            }
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        let cameraAuthStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let photosAuthStatus = PHPhotoLibrary.authorizationStatus()
        let audioAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        
        let cameraPermission: String
        switch cameraAuthStatus {
        case .authorized:
            cameraPermission = "granted"
        case .denied, .restricted:
            cameraPermission = "denied"
        case .notDetermined:
            cameraPermission = "prompt"
        @unknown default:
            cameraPermission = "prompt"
        }
        
        let photosPermission: String
        switch photosAuthStatus {
        case .authorized, .limited:
            photosPermission = "granted"
        case .denied, .restricted:
            photosPermission = "denied"
        case .notDetermined:
            photosPermission = "prompt"
        @unknown default:
            photosPermission = "prompt"
        }

        let audioPermission: String
        switch audioAuthStatus {
        case .authorized:
            audioPermission = "granted"
        case .denied, .restricted:
            audioPermission = "denied"
        case .notDetermined:
            audioPermission = "prompt"
        @unknown default:
            audioPermission = "prompt"
        }
        
        call.resolve([
            "camera": cameraPermission,
            "photos": photosPermission,
            "audio": audioPermission
        ])
    }
    
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var cameraResult = "prompt"
        var photosResult = "prompt"
        var audioResult = "prompt"
        
        // Request camera permission
        group.enter()
        AVCaptureDevice.requestAccess(for: .video) { granted in
            cameraResult = granted ? "granted" : "denied"
            group.leave()
        }
        
        // Request photos permission
        group.enter()
        PHPhotoLibrary.requestAuthorization { status in
            switch status {
            case .authorized, .limited:
                photosResult = "granted"
            case .denied, .restricted:
                photosResult = "denied"
            case .notDetermined:
                photosResult = "prompt"
            @unknown default:
                photosResult = "denied"
            }
            group.leave()
        }

        // Request microphone permission
        group.enter()
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            audioResult = granted ? "granted" : "denied"
            group.leave()
        }
        
        // Wait for both permissions and return result
        group.notify(queue: .main) {
            call.resolve([
                "camera": cameraResult,
                "photos": photosResult,
                "audio": audioResult
            ])
        }
    }

    @objc func setFlash(_ call: CAPPluginCall) {
        guard let modeString = call.getString("flashMode") else {
            call.reject("Missing flash mode parameter")
            return
        }
        
        let flashMode: AVCaptureDevice.FlashMode
        switch modeString {
        case "on": flashMode = .on
        case "auto": flashMode = .auto
        default: flashMode = .off
        }
        
        // Check if the current device supports flash
        guard let device = currentInput?.device, device.hasFlash else {
            call.reject("Flash not available on current camera")
            return
        }
        
        // Update the current flash mode
        currentFlashMode = flashMode
        
        call.resolve(["flashMode": modeString])
    }

    @objc func getFlash(_ call: CAPPluginCall) {
        let modeString: String
        switch currentFlashMode {
        case .on: modeString = "on"
        case .auto: modeString = "auto"
        default: modeString = "off"
        }
        
        call.resolve(["flashMode": modeString])
    }

    @objc func setTorch(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("Missing enabled parameter")
            return
        }
        guard let device = currentInput?.device, device.hasTorch, device.isTorchAvailable else {
            call.reject("Torch not available on current camera")
            return
        }
        do {
            try device.lockForConfiguration()
            device.torchMode = enabled ? .on : .off
            device.unlockForConfiguration()
            call.resolve()
        } catch {
            call.reject("Failed to set torch: \(error.localizedDescription)")
        }
    }

    @objc func getTorch(_ call: CAPPluginCall) {
        guard let device = currentInput?.device, device.hasTorch else {
            call.resolve(["enabled": false])
            return
        }
        let enabled = device.torchMode == .on
        call.resolve(["enabled": enabled])
    }

    @objc func queueBackgroundUpload(_ call: CAPPluginCall) {
        guard let imageUri = call.getString("imageUri"),
              let uploadEndpoint = call.getString("uploadEndpoint"),
              let headers = call.getObject("headers") else {
            call.reject("Missing required parameters")
            return
        }
        
        let formData = call.getObject("formData") ?? [:]
        let method = call.getString("method") ?? "POST"
        let deleteAfterUpload = call.getBool("deleteAfterUpload") ?? true // Default: true
        let jobId = UUID().uuidString
        
        // Generate unique filename from imageUri or timestamp
        let uniqueFileName = self.generateUniqueFileName(from: imageUri)
        
        // Store upload job for background processing
        let uploadJob: [String: Any] = [
            "jobId": jobId,
            "imageUri": imageUri,
            "uploadEndpoint": uploadEndpoint,
            "headers": headers,
            "formData": formData,
            "method": method,
            "fileName": uniqueFileName,
            "deleteAfterUpload": deleteAfterUpload,
            "status": "pending",
            "createdAt": Date().timeIntervalSince1970
        ]
        
        UserDefaults.standard.set(uploadJob, forKey: "uploadJob_\(jobId)")
        
        // Schedule proper background task
        self.scheduleBackgroundUpload(jobId: jobId, uploadJob: uploadJob)
        
        call.resolve(["jobId": jobId])
    }
    
    private func generateUniqueFileName(from imageUri: String) -> String {
        // Extract filename from URI if possible
        if let url = URL(string: imageUri) {
            let pathExtension = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let baseName = url.deletingPathExtension().lastPathComponent
            
            // If we have a meaningful filename, use it with timestamp
            if !baseName.isEmpty && baseName != "image" {
                return "\(baseName)_\(Int(Date().timeIntervalSince1970)).\(pathExtension)"
            }
        }
        
        // Fallback to timestamp-based naming
        let timestamp = Int(Date().timeIntervalSince1970)
        let randomId = UUID().uuidString.prefix(8)
        return "photo_\(timestamp)_\(randomId).jpg"
    }
    
    private func scheduleBackgroundUpload(jobId: String, uploadJob: [String: Any]) {
        // iOS 13+ only - use modern BGTaskScheduler
        if #available(iOS 13.0, *) {
            let request = BGProcessingTaskRequest(identifier: "com.cameramulticapture.upload")
            request.requiresNetworkConnectivity = true
            request.requiresExternalPower = false
            
            do {
                try BGTaskScheduler.shared.submit(request)
                print("✅ Background upload task scheduled: \(jobId)")
                
                // Start immediate upload attempt
                self.performHttpUpload(jobId: jobId, uploadJob: uploadJob)
            } catch {
                print("❌ Failed to schedule background task: \(error)")
                // Fallback to immediate upload
                self.performHttpUpload(jobId: jobId, uploadJob: uploadJob)
            }
        } else {
            // iOS 12 and below - not supported, but still attempt immediate upload
            print("⚠️ Background uploads require iOS 13+. Attempting immediate upload only.")
            self.performHttpUpload(jobId: jobId, uploadJob: uploadJob)
        }
    }
    
    @objc func getUploadStatus(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId") else {
            call.reject("Missing jobId parameter")
            return
        }
        
        if let uploadJob = UserDefaults.standard.dictionary(forKey: "uploadJob_\(jobId)") {
            let status = uploadJob["status"] as? String ?? "failed"
            var result: [String: Any] = ["status": status]
            
            if let error = uploadJob["error"] as? String {
                result["error"] = error
            }
            
            call.resolve(result)
        } else {
            call.resolve(["status": "failed", "error": "Job not found"])
        }
    }

    @objc func getVersion(_ call: CAPPluginCall) {
        call.resolve(["version": pluginVersion])
    }

    private func performHttpUpload(jobId: String, uploadJob: [String: Any]) {
        guard let imageUri = uploadJob["imageUri"] as? String,
              let uploadEndpoint = uploadJob["uploadEndpoint"] as? String,
              let headers = uploadJob["headers"] as? [String: Any],
              let method = uploadJob["method"] as? String else {
            updateJobStatus(jobId: jobId, status: "failed", error: "Invalid job data")
            return
        }
        
        updateJobStatus(jobId: jobId, status: "uploading")
        
        guard let url = URL(string: uploadEndpoint),
              let imageUrl = URL(string: imageUri) else {
            updateJobStatus(jobId: jobId, status: "failed", error: "Invalid URLs")
            return
        }
        
        // 🚀 Move file I/O to background thread to prevent UI blocking
        DispatchQueue.global(qos: .background).async {
            do {
                let imageData = try Data(contentsOf: imageUrl)
                
                var request = URLRequest(url: url)
                request.httpMethod = method
                request.timeoutInterval = 60
                
                // Add headers
                for (key, value) in headers {
                    if let stringValue = value as? String {
                        request.setValue(stringValue, forHTTPHeaderField: key)
                    }
                }
                
                // Set body based on method
                if method.uppercased() == "PUT" {
                    // For PUT requests (Azure, S3), send raw image data
                    request.httpBody = imageData
                } else {
                    // For POST requests, create multipart form data
                    let boundary = UUID().uuidString
                    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                    
                    var body = Data()
                    
                    // Add form data fields
                    if let formData = uploadJob["formData"] as? [String: Any] {
                        for (key, value) in formData {
                            body.append("--\(boundary)\r\n".data(using: .utf8)!)
                            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
                            body.append("\(value)\r\n".data(using: .utf8)!)
                        }
                    }
                    
                    // Add image file with unique filename
                    let fileName = uploadJob["fileName"] as? String ?? "photo_\(Int(Date().timeIntervalSince1970)).jpg"
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
                    body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
                    body.append(imageData)
                    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
                    
                    request.httpBody = body
                }
                
                // Perform upload
                let task = URLSession.shared.dataTask(with: request) { data, response, error in
                    if let error = error {
                        self.updateJobStatus(jobId: jobId, status: "failed", error: error.localizedDescription)
                        return
                    }
                    
                    if let httpResponse = response as? HTTPURLResponse {
                        if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                            self.updateJobStatus(jobId: jobId, status: "completed")
                            
                            // 🚀 Clean up file after successful upload (if enabled)
                            if let deleteAfterUpload = uploadJob["deleteAfterUpload"] as? Bool, deleteAfterUpload,
                               let imageUri = uploadJob["imageUri"] as? String,
                               let imageUrl = URL(string: imageUri) {
                                do {
                                    try FileManager.default.removeItem(at: imageUrl)
                                    print("✅ Cleaned up file after successful upload: \(imageUri)")
                                } catch {
                                    print("⚠️ Failed to clean up file: \(error.localizedDescription)")
                                }
                            }
                            
                            // Clean up completed job after some time
                            DispatchQueue.main.asyncAfter(deadline: .now() + 300) { // 5 minutes
                                UserDefaults.standard.removeObject(forKey: "uploadJob_\(jobId)")
                            }
                        } else {
                            self.updateJobStatus(jobId: jobId, status: "failed", error: "HTTP \(httpResponse.statusCode)")
                        }
                    }
                }
                
                task.resume()
                
            } catch {
                self.updateJobStatus(jobId: jobId, status: "failed", error: error.localizedDescription)
            }
        }
    }
    
    private func updateJobStatus(jobId: String, status: String, error: String? = nil) {
        var uploadJob = UserDefaults.standard.dictionary(forKey: "uploadJob_\(jobId)") ?? [:]
        uploadJob["status"] = status
        if let error = error {
            uploadJob["error"] = error
        }
        UserDefaults.standard.set(uploadJob, forKey: "uploadJob_\(jobId)")
    }
    
    // MARK: - Thumbnail Generation
    
    /**
     * Generate thumbnail using native iOS APIs
     * Uses UIImage scaling with UIGraphicsImageRenderer for optimal performance
     */
    func generateThumbnail(from imageData: Data, size: CGFloat) -> String? {
        guard let originalImage = UIImage(data: imageData) else {
            return nil
        }
        
        // Calculate thumbnail size maintaining aspect ratio (center crop)
        let thumbnailSize = CGSize(width: size, height: size)
        
        // Use UIGraphicsImageRenderer for efficient thumbnail generation
        let renderer = UIGraphicsImageRenderer(size: thumbnailSize)
        
        let thumbnail = renderer.image { context in
            // Calculate scaling and cropping
            let originalSize = originalImage.size
            let scale = max(thumbnailSize.width / originalSize.width, thumbnailSize.height / originalSize.height)
            
            let scaledSize = CGSize(
                width: originalSize.width * scale,
                height: originalSize.height * scale
            )
            
            let drawRect = CGRect(
                x: (thumbnailSize.width - scaledSize.width) / 2,
                y: (thumbnailSize.height - scaledSize.height) / 2,
                width: scaledSize.width,
                height: scaledSize.height
            )
            
            originalImage.draw(in: drawRect)
        }
        
        // Convert to JPEG data with compression
        guard let thumbnailData = thumbnail.jpegData(compressionQuality: 0.85) else {
            return nil
        }
        
        // Convert to Base64 data URI
        let base64String = thumbnailData.base64EncodedString()
        return "data:image/jpeg;base64,\(base64String)"
    }

    /**
     * Generate thumbnail image from a video file.
     */
    func generateVideoThumbnail(from videoURL: URL, size: CGFloat) -> String? {
        let asset = AVAsset(url: videoURL)
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.maximumSize = CGSize(width: size, height: size)

        do {
            let cgImage = try imageGenerator.copyCGImage(at: .zero, actualTime: nil)
            let image = UIImage(cgImage: cgImage)
            guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
                return nil
            }
            return "data:image/jpeg;base64,\(jpegData.base64EncodedString())"
        } catch {
            return nil
        }
    }

    /**
     * Get video duration in seconds.
     */
    func getVideoDuration(from videoURL: URL) -> Double {
        let asset = AVAsset(url: videoURL)
        let duration = asset.duration
        if duration.isValid && duration.seconds.isFinite {
            return duration.seconds
        }
        return 0
    }
}

class VideoCaptureDelegate: NSObject, AVCaptureFileOutputRecordingDelegate {
    private let completion: (URL, Error?) -> Void

    init(completion: @escaping (URL, Error?) -> Void) {
        self.completion = completion
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        completion(outputFileURL, error)
    }
}

class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    weak var plugin: CameraMultiCapturePlugin?
    var call: CAPPluginCall
    var resultType: String
    var isFrontCamera: Bool
    var enableSaving: Bool
    var galleryAlbumName: String

    init(plugin: CameraMultiCapturePlugin, call: CAPPluginCall, resultType: String, isFrontCamera: Bool, enableSaving: Bool, galleryAlbumName: String) {
        self.plugin = plugin
        self.call = call
        self.resultType = resultType
        self.isFrontCamera = isFrontCamera
        self.enableSaving = enableSaving
        self.galleryAlbumName = galleryAlbumName
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        if let error = error {
            call.reject("Photo capture error: \(error.localizedDescription)")
            return
        }

        guard let data = photo.fileDataRepresentation() else {
            call.reject("No image data")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let tempDir = FileManager.default.temporaryDirectory
            let fileName = UUID().uuidString + ".jpg"
            let fileURL = tempDir.appendingPathComponent(fileName)

            do {
                try data.write(to: fileURL)

                if self.enableSaving {
                    self.saveImageToGallery(fileURL: fileURL)
                }

                var imageData = [String: String]()
                imageData["uri"] = fileURL.absoluteString

                if let thumbnailDataUri = self.plugin?.generateThumbnail(from: data, size: 200) {
                    imageData["thumbnail"] = thumbnailDataUri
                } else {
                    imageData["thumbnail"] = ""
                }

                DispatchQueue.main.async {
                    self.call.resolve(["value": imageData])
                }
            } catch {
                DispatchQueue.main.async {
                    self.call.reject("Failed to process image: \(error.localizedDescription)")
                }
            }
        }
    }

    private func saveImageToGallery(fileURL: URL) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: fileURL, options: nil)
        }) { success, error in
            if let error = error {
                print("[CameraMultiCapture] Failed to save photo to gallery: \(error.localizedDescription)")
            }
        }
    }
}

extension UIImage {
    func mirrorHorizontally() -> UIImage {
        UIGraphicsBeginImageContextWithOptions(self.size, false, self.scale)
        guard let context = UIGraphicsGetCurrentContext() else {
            return self
        }

        context.translateBy(x: self.size.width, y: 0)
        context.scaleBy(x: -1.0, y: 1.0)

        self.draw(in: CGRect(origin: .zero, size: self.size))

        let mirroredImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()

        return mirroredImage ?? self
    }
}
