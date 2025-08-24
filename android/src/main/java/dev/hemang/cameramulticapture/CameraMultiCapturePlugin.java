package dev.hemang.cameramulticapture;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
import android.view.Surface;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "CameraMultiCapture",
    permissions = {
        @Permission(strings = {Manifest.permission.CAMERA}, alias = "camera"),
        @Permission(strings = {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        }, alias = "photos")
    }
)
public class CameraMultiCapturePlugin extends Plugin {

    private PreviewView previewView;
    private ImageCapture imageCapture;
    private Camera camera;
    private ProcessCameraProvider cameraProvider;
    private CameraConfig currentConfig = new CameraConfig();

    private void ensurePreviewView() {
        if (previewView != null) return;

        previewView = new PreviewView(getContext());
        
        android.util.DisplayMetrics displayMetrics = new android.util.DisplayMetrics();
        getActivity().getWindowManager().getDefaultDisplay().getMetrics(displayMetrics);
        float density = displayMetrics.density;
        
        FrameLayout.LayoutParams params;
        if (currentConfig.previewWidth == ViewGroup.LayoutParams.MATCH_PARENT && 
            currentConfig.previewHeight == ViewGroup.LayoutParams.MATCH_PARENT) {
            params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
        } else {
            int widthInPixels = (int) (currentConfig.previewWidth * density);
            int heightInPixels = (int) (currentConfig.previewHeight * density);
            
            params = new FrameLayout.LayoutParams(widthInPixels, heightInPixels);
            
            params.leftMargin = (int) (currentConfig.previewX * density);
            params.topMargin = (int) (currentConfig.previewY * density);
        }
        
        previewView.setLayoutParams(params);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);

        if (previewView.getParent() != null) {
            ((ViewGroup) previewView.getParent()).removeView(previewView);
        }

        ViewGroup rootView = getActivity().findViewById(android.R.id.content);
        rootView.addView(previewView, 0);

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(Color.TRANSPARENT);
            bridge.getWebView().setAlpha(1.0f);
            bridge.getWebView().bringToFront();
        }

        rootView.requestLayout();
        rootView.invalidate();
    }

    private void bindCameraSession() {
        if (cameraProvider == null || previewView == null) {
            Log.e("CameraMultiCapture", "Camera provider or previewView is null");
            return;
        }

        cameraProvider.unbindAll();

        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        // Swap resolution dimensions for portrait orientations
        Size finalResolution = currentConfig.resolution;
        if (currentConfig.targetRotation == Surface.ROTATION_0 || currentConfig.targetRotation == Surface.ROTATION_180) {
            // Portrait orientations - ensure height > width
            if (currentConfig.resolution.getWidth() > currentConfig.resolution.getHeight()) {
                finalResolution = new Size(currentConfig.resolution.getHeight(), currentConfig.resolution.getWidth());
            }
        } else {
            // Landscape orientations - ensure width > height  
            if (currentConfig.resolution.getHeight() > currentConfig.resolution.getWidth()) {
                finalResolution = new Size(currentConfig.resolution.getHeight(), currentConfig.resolution.getWidth());
            }
        }

        imageCapture = new ImageCapture.Builder()
        .setCaptureMode(currentConfig.captureMode)
        .setTargetRotation(currentConfig.targetRotation)
        .setTargetResolution(finalResolution)
        .setFlashMode(currentConfig.flashMode)
        .build();

        CameraSelector cameraSelector = new CameraSelector.Builder()
            .requireLensFacing(currentConfig.lensFacing)
            .build();

        camera = cameraProvider.bindToLifecycle(
            getActivity(),
            cameraSelector,
            preview,
            imageCapture
        );

        camera.getCameraControl().setZoomRatio(currentConfig.zoomRatio);
        previewView.setKeepScreenOn(true);

    }

    @PluginMethod
    public void start(PluginCall call) {
        // Check permissions before starting camera
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission not granted. Please call requestPermissions() first.");
            return;
        }

        currentConfig = CameraConfigMapper.fromJSObject(call.getData());

        // Auto-detect device orientation if not provided by JavaScript
        if (!call.hasOption("rotation")) {
            int deviceRotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
            currentConfig.targetRotation = deviceRotation;
        }

        getActivity().runOnUiThread(() -> {
            ensurePreviewView();
            ProcessCameraProvider.getInstance(getContext()).addListener(() -> {
                try {
                    cameraProvider = ProcessCameraProvider.getInstance(getContext()).get();
                    bindCameraSession();
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Failed to bind camera session: " + e.getMessage(), e);
                }
            }, ContextCompat.getMainExecutor(getContext()));
        });
    }
 
    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (cameraProvider != null) {
                    cameraProvider.unbindAll();
                    cameraProvider = null;
                }
                if (previewView != null) {
                    ViewGroup parent = (ViewGroup) previewView.getParent();
                    if (parent != null) {
                        parent.removeView(previewView);
                    }
                    previewView = null;
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to stop camera: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void capture(PluginCall call) {
        if (imageCapture == null) {
            call.reject("ImageCapture not initialized");
            return;
        }

        int quality = call.getInt("quality", currentConfig.jpegQuality);

        try {
            File photoFile = new File(getContext().getCacheDir(), "photo_" + System.currentTimeMillis() + ".jpg");
            ImageCapture.OutputFileOptions outputOptions = new ImageCapture.OutputFileOptions.Builder(photoFile).build();

            imageCapture.takePicture(
                outputOptions,
                ContextCompat.getMainExecutor(getContext()),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                        JSObject result = new JSObject();
                        JSObject imageData = new JSObject();
                        
                        try {
                            Uri uri = Uri.fromFile(photoFile);
                            imageData.put("uri", uri.toString());
                            
                            byte[] bytes = java.nio.file.Files.readAllBytes(photoFile.toPath());
                            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                            String base64Data = "data:image/jpeg;base64," + base64;
                            imageData.put("base64", base64Data);
                            
                            result.put("value", imageData);
                        } catch (Exception e) {
                            call.reject("Failed to process photo file", e);
                            return;
                        }
                        call.resolve(result);
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException exception) {
                        call.reject("Photo capture failed: " + exception.getMessage());
                    }
                }
            );
        } catch (Exception e) {
            call.reject("Capture error: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void setZoom(PluginCall call) {
        float zoom;
        if (call.hasOption("zoom")) {
            Double zoomValue = call.getDouble("zoom");
            zoom = zoomValue != null ? zoomValue.floatValue() : currentConfig.zoomRatio;
        } else {
            zoom = currentConfig.zoomRatio;
        }
        currentConfig.zoomRatio = zoom;
        getActivity().runOnUiThread(() -> {
            if (camera != null) {
                camera.getCameraControl().setZoomRatio(zoom);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void switchCamera(PluginCall call) {
        currentConfig.lensFacing = (currentConfig.lensFacing == CameraSelector.LENS_FACING_BACK)
            ? CameraSelector.LENS_FACING_FRONT
            : CameraSelector.LENS_FACING_BACK;

        try {
            getActivity().runOnUiThread(() -> {
                bindCameraSession();
                call.resolve();
            });
        } catch (Exception e) {
            call.reject("Failed to switch camera: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void updatePreviewRect(PluginCall call) {
        JSObject previewRect = call.getData();
        if (previewRect == null) {
            call.reject("Missing previewRect data");
            return;
        }

        // Update the current config with new dimensions
        currentConfig.previewWidth = previewRect.getInteger("width", currentConfig.previewWidth);
        currentConfig.previewHeight = previewRect.getInteger("height", currentConfig.previewHeight);
        currentConfig.previewX = previewRect.getInteger("x", currentConfig.previewX);
        currentConfig.previewY = previewRect.getInteger("y", currentConfig.previewY);

        getActivity().runOnUiThread(() -> {
            if (!call.hasOption("rotation")) {
                int deviceRotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
                
                if (currentConfig.targetRotation != deviceRotation) {
                    // Update BOTH the config AND the ImageCapture object
                    currentConfig.targetRotation = deviceRotation;
                    
                    // Update ImageCapture target rotation if available
                    if (imageCapture != null) {
                        imageCapture.setTargetRotation(deviceRotation);
                    }
                }
            }
            
            if (previewView != null && cameraProvider != null) {
                // Update preview view layout
                android.util.DisplayMetrics displayMetrics = new android.util.DisplayMetrics();
                getActivity().getWindowManager().getDefaultDisplay().getMetrics(displayMetrics);
                float density = displayMetrics.density;

                FrameLayout.LayoutParams params;
                if (currentConfig.previewWidth == ViewGroup.LayoutParams.MATCH_PARENT && 
                    currentConfig.previewHeight == ViewGroup.LayoutParams.MATCH_PARENT) {
                    params = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    );
                } else {
                    int widthInPixels = (int) (currentConfig.previewWidth * density);
                    int heightInPixels = (int) (currentConfig.previewHeight * density);

                    params = new FrameLayout.LayoutParams(widthInPixels, heightInPixels);

                    params.leftMargin = (int) (currentConfig.previewX * density);
                    params.topMargin = (int) (currentConfig.previewY * density);
                }

                previewView.setLayoutParams(params);
                previewView.requestLayout();
                call.resolve();
            } else {
                call.reject("Preview view not initialized");
            }
        });
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        
        // Check camera permission
        PermissionState cameraState = getPermissionState("camera");
        result.put("camera", cameraState.toString());
        
        // Check photos/storage permission
        PermissionState photosState = getPermissionState("photos");
        result.put("photos", photosState.toString());
        
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // Request all permissions that aren't already granted
        if (getPermissionState("camera") != PermissionState.GRANTED || 
            getPermissionState("photos") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[]{"camera", "photos"}, call, "permissionCallback");
        } else {
            // All permissions already granted
            checkPermissions(call);
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        // After permission request, return the current status
        checkPermissions(call);
    }

    @PluginMethod
    public void setFlash(PluginCall call) {
        String flashMode = call.getString("flashMode");
        if (flashMode == null) {
            call.reject("Missing flashMode parameter");
            return;
        }

        int flashModeInt;
        switch (flashMode) {
            case "on":
                flashModeInt = ImageCapture.FLASH_MODE_ON;
                break;
            case "auto":
                flashModeInt = ImageCapture.FLASH_MODE_AUTO;
                break;
            default:
                flashModeInt = ImageCapture.FLASH_MODE_OFF;
                break;
        }

        currentConfig.flashMode = flashModeInt;

        // Rebuild camera session to apply flash settings
        getActivity().runOnUiThread(() -> {
            try {
                bindCameraSession();
                JSObject result = new JSObject();
                result.put("flashMode", flashMode);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Failed to set flash mode: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void getFlash(PluginCall call) {
        String flashMode;
        switch (currentConfig.flashMode) {
            case ImageCapture.FLASH_MODE_ON:
                flashMode = "on";
                break;
            case ImageCapture.FLASH_MODE_AUTO:
                flashMode = "auto";
                break;
            default:
                flashMode = "off";
                break;
        }

        JSObject result = new JSObject();
        result.put("flashMode", flashMode);
        call.resolve(result);
    }

}
