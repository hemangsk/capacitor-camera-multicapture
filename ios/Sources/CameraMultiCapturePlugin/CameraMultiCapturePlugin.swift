import AVFoundation
import Capacitor
import CoreMotion
import Foundation
import Photos
import BackgroundTasks
import UIKit

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
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePreviewRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFlash", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFlash", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailableZoomLevels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailableCameras", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchToPhysicalCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueBackgroundUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUploadStatus", returnType: CAPPluginReturnPromise),
    ]

    var captureSession: AVCaptureSession?
    var currentInput: AVCaptureDeviceInput?
    var photoOutput: AVCapturePhotoOutput?
    var previewLayer: AVCaptureVideoPreviewLayer?
    var cameraPreviewView: UIView?
    var cameraPosition: AVCaptureDevice.Position = .back
    var currentFlashMode: AVCaptureDevice.FlashMode = .off
    var currentOrientation: AVCaptureVideoOrientation = .portrait
    let sessionQueue = DispatchQueue(label: "camera.session.queue")
    var captureDelegate: PhotoCaptureDelegate?
    var motionManager: CMMotionManager?

    @objc func start(_ call: CAPPluginCall) {
        print("Received data from JS: \(call.dictionaryRepresentation)")

        startMotionManager()

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
        let qualityPreset: AVCaptureSession.Preset = (qualityName == "low") ? .high : .photo
        let zoom = CGFloat(call.getFloat("zoom") ?? 1.0)
        let jpegQuality = CGFloat(call.getFloat("jpegQuality") ?? 0.8)
        let autofocus = call.getBool("autoFocus") ?? true
        
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
        stopMotionManager()
        
        DispatchQueue.main.async {
            self.captureSession?.stopRunning()
            self.previewLayer?.removeFromSuperlayer()
            self.captureSession = nil
            self.currentInput = nil
            self.photoOutput = nil
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

        let resultType = call.getString("resultType") ?? "base64"
        let settings = AVCapturePhotoSettings()
        settings.isHighResolutionPhotoEnabled = photoOutput.isHighResolutionCaptureEnabled
        
        // Apply flash settings
        if photoOutput.supportedFlashModes.contains(currentFlashMode) {
            settings.flashMode = currentFlashMode
        }
        
        currentOrientation = detectCurrentOrientation()
        
        if let connection = photoOutput.connection(with: .video) {
            connection.videoOrientation = currentOrientation
            // Prevent front camera from capturing mirrored images
            if self.cameraPosition == .front {
                connection.isVideoMirrored = false
            }
        }
        
        let delegate = PhotoCaptureDelegate(plugin: self, call: call, resultType: resultType)
        self.captureDelegate = delegate

        photoOutput.capturePhoto(with: settings, delegate: delegate)
    }

    @objc func setZoom(_ call: CAPPluginCall) {
        guard let input = currentInput else {
            call.reject("Camera not initialized")
            return
        }
        let zoomFactor = CGFloat(call.getFloat("zoom") ?? 1.0)
        do {
            try input.device.lockForConfiguration()
            // Clamp zoom factor to valid range
            let minZoom = input.device.minAvailableVideoZoomFactor
            let maxZoom = input.device.activeFormat.videoMaxZoomFactor
            input.device.videoZoomFactor = max(minZoom, min(zoomFactor, maxZoom))
            input.device.unlockForConfiguration()
            call.resolve(["zoom": input.device.videoZoomFactor])
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
        let minZoom = device.minAvailableVideoZoomFactor
        let maxZoom = device.activeFormat.videoMaxZoomFactor
        
        // Generate suggested preset levels based on device capabilities
        var presetLevels: [Float] = []
        
        // Add ultra-wide if available (0.5x or 0.7x depending on device)
        if minZoom < 1.0 {
            let ultraWide: Float
            if minZoom > 0.6 && minZoom < 0.8 {
                ultraWide = 0.7
            } else if minZoom < 0.6 {
                ultraWide = 0.5
            } else {
                ultraWide = Float(minZoom)
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
        session.beginConfiguration()
        session.removeInput(currentInput)
        self.cameraPosition = (self.cameraPosition == .back) ? .front : .back
        do {
            if let newDevice = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: self.cameraPosition)
            {
                let newInput = try AVCaptureDeviceInput(device: newDevice)
                if session.canAddInput(newInput) {
                    session.addInput(newInput)
                    self.currentInput = newInput
                    call.resolve()
                } else {
                    call.reject("Cannot add new camera input")
                }
            } else {
                call.reject("Desired camera not available")
            }
        } catch {
            call.reject("Switch camera error: \(error.localizedDescription)")
        }
        session.commitConfiguration()
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
        
        // Standard zoom factors for each lens type
        if hasUltrawide {
            result["ultrawideZoomFactor"] = 0.5
        }
        result["wideZoomFactor"] = 1.0
        if hasTelephoto {
            // Telephoto zoom factor varies by device (2x, 2.5x, 3x, etc.)
            // We'll use 2.0 as default but this should be device-specific
            result["telephotoZoomFactor"] = 2.0
        }
        
        call.resolve(result)
    }
    
    @objc func switchToPhysicalCamera(_ call: CAPPluginCall) {
        guard let session = captureSession,
              let zoomFactor = call.getFloat("zoomFactor") else {
            call.reject("Camera not initialized or missing zoomFactor parameter")
            return
        }
        
        // Determine which camera to use based on zoom factor
        let deviceType: AVCaptureDevice.DeviceType
        if zoomFactor < 1.0 {
            deviceType = .builtInUltraWideCamera
        } else if zoomFactor >= 2.0 {
            deviceType = .builtInTelephotoCamera
        } else {
            deviceType = .builtInWideAngleCamera
        }
        
        // Try to get the requested camera
        guard let newDevice = AVCaptureDevice.default(
            deviceType, for: .video, position: cameraPosition
        ) else {
            // Fallback to wide angle if requested camera not available
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
            // Add new input
            let newInput = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(newInput) {
                session.addInput(newInput)
                self.currentInput = newInput
                
                // Reset zoom to 1.0 for the new camera
                try device.lockForConfiguration()
                device.videoZoomFactor = 1.0
                device.unlockForConfiguration()
                
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

        guard
            let camera = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: config.cameraPosition)
        else {
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
        session.commitConfiguration()
        self.captureSession = session

        do {
            try camera.lockForConfiguration()
            camera.videoZoomFactor = config.zoom
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
        
        call.resolve([
            "camera": cameraPermission,
            "photos": photosPermission
        ])
    }
    
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var cameraResult = "prompt"
        var photosResult = "prompt"
        
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
        
        // Wait for both permissions and return result
        group.notify(queue: .main) {
            call.resolve([
                "camera": cameraResult,
                "photos": photosResult
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
    
    // MARK: - Motion Manager for Orientation Detection
    
    private func startMotionManager() {
        if motionManager == nil {
            motionManager = CMMotionManager()
        }
        
        if let motionManager = motionManager, motionManager.isAccelerometerAvailable {
            motionManager.accelerometerUpdateInterval = 0.2
            motionManager.startAccelerometerUpdates()
        }
    }
    
    private func stopMotionManager() {
        motionManager?.stopAccelerometerUpdates()
        motionManager = nil
    }
    
    private func detectCurrentOrientation() -> AVCaptureVideoOrientation {
        if let motionManager = motionManager,
           let accelerometerData = motionManager.accelerometerData {
            let acceleration = accelerometerData.acceleration
            let x = acceleration.x
            let y = acceleration.y
            
            if abs(y) > abs(x) {
                if y < -0.5 {
                    return .portrait
                } else {
                    return .portraitUpsideDown
                }
            } else {
                if x > 0.5 {
                    return .landscapeLeft
                } else {
                    return .landscapeRight
                }
            }
        }
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
            return .portrait
        }
    }
}

class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    weak var plugin: CameraMultiCapturePlugin?
    var call: CAPPluginCall
    var resultType: String

    init(plugin: CameraMultiCapturePlugin, call: CAPPluginCall, resultType: String) {
        self.plugin = plugin
        self.call = call
        self.resultType = resultType
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
            guard let originalImage = UIImage(data: data) else {
                DispatchQueue.main.async {
                    self.call.reject("Failed to load image from data")
                }
                return
            }
            
            var metadata = self.extractMetadata(from: photo)
            let correctedImage = originalImage.reformat()
            
            self.overwriteMetadataOrientation(in: &metadata, to: 1)
            
            guard let correctedJpegData = self.generateJPEG(from: correctedImage, metadata: metadata, quality: 0.95) else {
                DispatchQueue.main.async {
                    self.call.reject("Failed to generate corrected JPEG")
                }
                return
            }
            
            let tempDir = FileManager.default.temporaryDirectory
            let fileName = UUID().uuidString + ".jpg"
            let fileURL = tempDir.appendingPathComponent(fileName)
            
            do {
                try correctedJpegData.write(to: fileURL)
                
                var imageData = [String: String]()
                imageData["uri"] = fileURL.absoluteString
                
                if let thumbnailDataUri = self.plugin?.generateThumbnail(from: correctedJpegData, size: 200) {
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
    
    // MARK: - Image Processing (Adapted from Capacitor Camera Plugin)
    // Source: https://github.com/ionic-team/capacitor-plugins/blob/main/camera/ios/Sources/CameraPlugin/CameraPlugin.swift
    // Copyright 2020-present Ionic (https://ionic.io)
    // Licensed under MIT License
    
    /**
     * Extract metadata from AVCapturePhoto
     */
    private func extractMetadata(from photo: AVCapturePhoto) -> [String: Any] {
        var metadata: [String: Any] = [:]
        
        if let photoMetadata = photo.metadata as? [String: Any] {
            metadata = photoMetadata
        }
        
        return metadata
    }
    
    /**
     * Overwrite orientation in metadata dictionary recursively
     * @param metadata Metadata dictionary to modify
     * @param orientation Target orientation value (typically 1 for normal)
     */
    private func overwriteMetadataOrientation(in metadata: inout [String: Any], to orientation: Int) {
        for key in metadata.keys {
            if key == "Orientation", metadata[key] as? Int != nil {
                metadata[key] = orientation
            } else if var child = metadata[key] as? [String: Any] {
                overwriteMetadataOrientation(in: &child, to: orientation)
                metadata[key] = child
            }
        }
    }
    
    /**
     * Generate JPEG data with embedded metadata
     * @param image Source image
     * @param metadata Metadata dictionary to embed
     * @param quality JPEG quality (0.0-1.0)
     * @return JPEG data with metadata, or nil if failed
     */
    private func generateJPEG(from image: UIImage, metadata: [String: Any], quality: CGFloat) -> Data? {
        // Convert UIImage to JPEG
        guard let jpegData = image.jpegData(compressionQuality: quality) else {
            return nil
        }
        
        // Create image source from JPEG data
        guard let source = CGImageSourceCreateWithData(jpegData as CFData, nil),
              let type = CGImageSourceGetType(source) else {
            return jpegData
        }
        
        // Create output buffer
        guard let output = NSMutableData(capacity: jpegData.count) as CFMutableData?,
              let destination = CGImageDestinationCreateWithData(output, type, 1, nil) else {
            return jpegData
        }
        
        // Add image with metadata
        CGImageDestinationAddImageFromSource(destination, source, 0, metadata as CFDictionary)
        
        // Finalize
        guard CGImageDestinationFinalize(destination) else {
            return jpegData
        }
        
        return output as Data
    }
}

// MARK: - UIImage Extension (Adapted from Capacitor Camera Plugin)
// Source: https://github.com/ionic-team/capacitor-plugins/blob/main/camera/ios/Sources/CameraPlugin/CameraExtensions.swift
// Copyright 2020-present Ionic (https://ionic.io)
// Licensed under MIT License

extension UIImage {
    /**
     * Generates a new image from the existing one, implicitly resetting any orientation
     * @param size Optional target size (maintains aspect ratio)
     * @return New image with corrected orientation
     */
    func reformat(to size: CGSize? = nil) -> UIImage {
        let imageHeight = self.size.height
        let imageWidth = self.size.width
        
        var maxWidth: CGFloat
        if let size = size, size.width > 0 {
            maxWidth = size.width
        } else {
            maxWidth = imageWidth
        }
        
        let maxHeight: CGFloat
        if let size = size, size.height > 0 {
            maxHeight = size.height
        } else {
            maxHeight = imageHeight
        }
        
        var targetWidth = min(imageWidth, maxWidth)
        var targetHeight = (imageHeight * targetWidth) / imageWidth
        if targetHeight > maxHeight {
            targetWidth = (imageWidth * maxHeight) / imageHeight
            targetHeight = maxHeight
        }
        
        UIGraphicsBeginImageContextWithOptions(
            .init(width: targetWidth, height: targetHeight),
            false,  // opaque
            1.0     // scale
        )
        self.draw(in: .init(origin: .zero, size: .init(width: targetWidth, height: targetHeight)))
        let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        
        return resizedImage ?? self
    }
}
