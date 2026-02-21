package dev.hemang.cameramulticapture;

import android.util.Size;
import android.view.Surface;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import com.getcapacitor.JSObject;
import android.view.ViewGroup;

public class CameraConfigMapper {
    public static CameraConfig fromJSObject(JSObject data) {
        CameraConfig config = new CameraConfig();

        String direction = data.getString("direction", "back");
        config.lensFacing = "front".equals(direction)
                ? CameraSelector.LENS_FACING_FRONT
                : CameraSelector.LENS_FACING_BACK;

        String captureMode = data.getString("captureMode", "minimizeLatency");
        config.captureMode = "maxQuality".equals(captureMode)
                ? ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY
                : ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY;

        JSObject resolution = data.getJSObject("resolution");
        if (resolution != null) {
            int width = resolution.getInteger("width", 1280);
            int height = resolution.getInteger("height", 720);
            config.resolution = new Size(width, height);
        }

        try {
            config.zoomRatio = data.has("zoom") ? (float) data.getDouble("zoom") : 1.0f;
        } catch (Exception e) {
            config.zoomRatio = 1.0f;
        }
        config.jpegQuality = data.has("quality") ? data.getInteger("quality") : 85;
        config.autoFocus = data.getBoolean("autoFocus", true);

        // Handle flash mode
        String flashMode = data.getString("flash", "off");
        switch (flashMode) {
            case "on":
                config.flashMode = ImageCapture.FLASH_MODE_ON;
                break;
            case "auto":
                config.flashMode = ImageCapture.FLASH_MODE_AUTO;
                break;
            default:
                config.flashMode = ImageCapture.FLASH_MODE_OFF;
                break;
        }

        // Handle rotation/orientation - use provided rotation or auto-detect from device
        if (data.has("rotation")) {
            int rotation = data.getInteger("rotation");
            switch (rotation) {
                case 90:
                    config.targetRotation = Surface.ROTATION_90;
                    break;
                case 180:
                    config.targetRotation = Surface.ROTATION_180;
                    break;
                case 270:
                    config.targetRotation = Surface.ROTATION_270;
                    break;
                default:
                    config.targetRotation = Surface.ROTATION_0;
                    break;
            }
        } else {
            // Auto-detect device orientation if no rotation provided
            // This will be set in the plugin when we have access to the activity
            config.targetRotation = Surface.ROTATION_0; // Will be updated in plugin
        }

        JSObject previewRect = data.getJSObject("previewRect");
        if (previewRect != null) {
            if (previewRect.has("width")) {
                config.previewWidth = previewRect.getInteger("width", ViewGroup.LayoutParams.MATCH_PARENT);
            }
            if (previewRect.has("height")) {
                config.previewHeight = previewRect.getInteger("height", ViewGroup.LayoutParams.MATCH_PARENT);
            }
            if (previewRect.has("x")) {
                config.previewX = previewRect.getInteger("x", 0);
            }
            if (previewRect.has("y")) {
                config.previewY = previewRect.getInteger("y", 0);
            }
        }

        // Handle pinch-to-zoom options
        JSObject pinchToZoom = data.getJSObject("pinchToZoom");
        if (pinchToZoom != null) {
            config.pinchToZoomEnabled = pinchToZoom.getBoolean("enabled", false);
            config.pinchToZoomLockToNearestStep = pinchToZoom.getBoolean("lockToNearestStep", false);
        } else {
            config.pinchToZoomEnabled = false;
            config.pinchToZoomLockToNearestStep = false;
        }

        return config;
    }
}