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
import android.view.OrientationEventListener;
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

import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import androidx.camera.camera2.interop.Camera2CameraInfo;

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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.json.JSONArray;
import androidx.work.*;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import android.net.Uri;
import java.io.File;

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
    private OrientationEventListener orientationEventListener;
    private int lastKnownOrientation = 0; // 0=portrait, 90=landscape-left, 180=upside-down, 270=landscape-right
    private boolean torchEnabled = false;

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

        // Preserve current zoom level before rebuilding session
        if (camera != null) {
            androidx.camera.core.ZoomState zoomState = camera.getCameraInfo().getZoomState().getValue();
            if (zoomState != null) {
                currentConfig.zoomRatio = zoomState.getZoomRatio();
            }
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

        startOrientationListener();

        if (!call.hasOption("rotation")) {
            int sensorOrientation = getRotationFromOrientation(lastKnownOrientation);
            currentConfig.targetRotation = sensorOrientation;
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
                stopOrientationListener();
                
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
        
        int sensorOrientation = getRotationFromOrientation(lastKnownOrientation);
        imageCapture.setTargetRotation(sensorOrientation);
        currentConfig.targetRotation = sensorOrientation;

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
                            boolean orientationCorrected = ImageUtils.correctImageOrientation(photoFile);
                            if (!orientationCorrected) {
                                Log.w("CameraMultiCapture", "Failed to correct image orientation");
                            }
                            
                            Uri uri = Uri.fromFile(photoFile);
                            imageData.put("uri", uri.toString());
                            
                            String thumbnailBase64 = ThumbnailGenerator.generateThumbnail(photoFile);
                            if (thumbnailBase64 != null) {
                                imageData.put("thumbnail", thumbnailBase64);
                            } else {
                                Log.w("CameraMultiCapture", "Thumbnail generation failed");
                                imageData.put("thumbnail", "");
                            }
                            
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
        
        getActivity().runOnUiThread(() -> {
            if (camera != null) {
                // Get the zoom state to determine min and max zoom ratios
                @SuppressWarnings("UnusedVariable")
                androidx.camera.core.ZoomState zoomState = camera.getCameraInfo().getZoomState().getValue();
                if (zoomState != null) {
                    float minZoom = zoomState.getMinZoomRatio();
                    float maxZoom = zoomState.getMaxZoomRatio();
                    // Clamp zoom to valid range
                    float clampedZoom = Math.max(minZoom, Math.min(zoom, maxZoom));
                    currentConfig.zoomRatio = clampedZoom;
                    camera.getCameraControl().setZoomRatio(clampedZoom);
                    call.resolve();
                } else {
                    // Fallback if zoom state is not available
                    currentConfig.zoomRatio = zoom;
                    camera.getCameraControl().setZoomRatio(zoom);
                    call.resolve();
                }
            } else {
                call.reject("Camera not initialized");
            }
        });
    }

    @PluginMethod
    public void getAvailableZoomLevels(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (camera != null) {
                androidx.camera.core.ZoomState zoomState = camera.getCameraInfo().getZoomState().getValue();
                if (zoomState != null) {
                    float minZoom = zoomState.getMinZoomRatio();
                    float maxZoom = zoomState.getMaxZoomRatio();
                    
                    // Generate suggested preset levels based on device capabilities
                    JSObject result = new JSObject();
                    result.put("minZoom", minZoom);
                    result.put("maxZoom", maxZoom);
                    
                    // Create preset levels array
                    List<Float> presetLevels = new ArrayList<>();
                    
                    // Add ultra-wide if available (0.5x or 0.7x depending on device)
                    if (minZoom < 1.0f) {
                        // Round to nearest common value (0.5 or 0.7)
                        float ultraWide = minZoom;
                        if (minZoom > 0.6f && minZoom < 0.8f) {
                            ultraWide = 0.7f;
                        } else if (minZoom < 0.6f) {
                            ultraWide = 0.5f;
                        }
                        presetLevels.add(ultraWide);
                    }
                    
                    // Always add 1x
                    presetLevels.add(1.0f);
                    
                    // Add telephoto presets based on max zoom
                    if (maxZoom >= 2.0f) {
                        presetLevels.add(2.0f);
                    }
                    if (maxZoom >= 3.0f) {
                        presetLevels.add(3.0f);
                    }
                    if (maxZoom >= 5.0f) {
                        presetLevels.add(5.0f);
                    }
                    if (maxZoom >= 10.0f) {
                        presetLevels.add(10.0f);
                    }
                    
                    // Convert to JSON array
                    JSONArray presetArray = new JSONArray();
                    for (Float level : presetLevels) {
                        presetArray.put(level);
                    }
                    result.put("presetLevels", presetArray);
                    
                    call.resolve(result);
                } else {
                    // Fallback if zoom state is not available
                    JSObject result = new JSObject();
                    result.put("minZoom", 1.0f);
                    result.put("maxZoom", 4.0f);
                    result.put("presetLevels", new JSONArray(Arrays.asList(1.0f, 2.0f, 3.0f, 4.0f)));
                    call.resolve(result);
                }
            } else {
                call.reject("Camera not initialized");
            }
        });
    }

    @PluginMethod
    public void queueBackgroundUpload(PluginCall call) {
        String imageUri = call.getString("imageUri");
        String uploadEndpoint = call.getString("uploadEndpoint");
        JSObject headers = call.getObject("headers");
        JSObject formData = call.getObject("formData", new JSObject());
        String method = call.getString("method", "POST");
        Boolean deleteAfterUpload = call.getBoolean("deleteAfterUpload", true); // Default: true
        
        if (imageUri == null || uploadEndpoint == null || headers == null) {
            call.reject("Missing required parameters");
            return;
        }
        
        String jobId = UUID.randomUUID().toString();
        String uniqueFileName = generateUniqueFileName(imageUri);
        
        Data inputData = new Data.Builder()
            .putString("jobId", jobId)
            .putString("imageUri", imageUri)
            .putString("uploadEndpoint", uploadEndpoint)
            .putString("headers", headers.toString())
            .putString("formData", formData.toString())
            .putString("method", method)
            .putString("fileName", uniqueFileName)
            .putBoolean("deleteAfterUpload", deleteAfterUpload)
            .build();
        
        OneTimeWorkRequest uploadWork = new OneTimeWorkRequest.Builder(GenericUploadWorker.class)
            .setInputData(inputData)
            .addTag(jobId)
            .setConstraints(new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build())
            .build();
        
        WorkManager.getInstance(getContext()).enqueue(uploadWork);
        
        JSObject result = new JSObject();
        result.put("jobId", jobId);
        call.resolve(result);
    }

    @PluginMethod
    public void getUploadStatus(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("Missing jobId parameter");
            return;
        }
        
        try {
            WorkManager workManager = WorkManager.getInstance(getContext());
            List<WorkInfo> workInfoList = workManager.getWorkInfosByTag(jobId).get();
            JSObject result = new JSObject();
            
            if (workInfoList.isEmpty()) {
                result.put("status", "failed");
                result.put("error", "Job not found");
            } else {
                WorkInfo workInfo = workInfoList.get(0);
                WorkInfo.State state = workInfo.getState();
                
                switch (state) {
                    case ENQUEUED:
                    case BLOCKED:
                        result.put("status", "pending");
                        break;
                    case RUNNING:
                        result.put("status", "uploading");
                        break;
                    case SUCCEEDED:
                        result.put("status", "completed");
                        break;
                    case FAILED:
                    case CANCELLED:
                        result.put("status", "failed");
                        Data outputData = workInfo.getOutputData();
                        String error = outputData.getString("error");
                        if (error != null) {
                            result.put("error", error);
                        }
                        break;
                }
            }
            
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get upload status: " + e.getMessage());
        }
    }
    
    private String generateUniqueFileName(String imageUri) {
        try {
            Uri uri = Uri.parse(imageUri);
            String path = uri.getPath();
            
            if (path != null && !path.isEmpty()) {
                String fileName = new File(path).getName();
                
                if (!fileName.isEmpty() && !fileName.equals("image.jpg")) {
                    String baseName = fileName.contains(".") ? 
                        fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
                    String extension = fileName.contains(".") ? 
                        fileName.substring(fileName.lastIndexOf('.')) : ".jpg";
                    
                    return baseName + "_" + System.currentTimeMillis() + extension;
                }
            }
            
            long timestamp = System.currentTimeMillis();
            String randomId = UUID.randomUUID().toString().substring(0, 8);
            return "photo_" + timestamp + "_" + randomId + ".jpg";
            
        } catch (Exception e) {
            return "photo_" + System.currentTimeMillis() + ".jpg";
        }
    }

    @PluginMethod
    public void switchCamera(PluginCall call) {
        currentConfig.lensFacing = (currentConfig.lensFacing == CameraSelector.LENS_FACING_BACK)
            ? CameraSelector.LENS_FACING_FRONT
            : CameraSelector.LENS_FACING_BACK;

        // If we are switching to the front camera, ensure the torch is turned off
        if (currentConfig.lensFacing == CameraSelector.LENS_FACING_FRONT && torchEnabled && camera != null) {
            try {
                camera.getCameraControl().enableTorch(false);
            } catch (Exception e) {
                Log.w("CameraMultiCapture", "Failed to disable torch on camera switch: " + e.getMessage());
            }
            torchEnabled = false;
        }

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
    public void getAvailableCameras(PluginCall call) {
        JSObject result = new JSObject();
        
        try {
            boolean hasUltrawide = false;
            boolean hasWide = false;
            boolean hasTelephoto = false;
            float ultrawideZoomFactor = 0.5f;
            float wideZoomFactor = 1.0f;
            float telephotoZoomFactor = 2.0f;
            
            // Check current camera's capabilities
            if (camera != null && camera.getCameraInfo() != null) {
                androidx.camera.core.ZoomState zoomState = camera.getCameraInfo().getZoomState().getValue();
                if (zoomState != null) {
                    float minZoom = zoomState.getMinZoomRatio();
                    float maxZoom = zoomState.getMaxZoomRatio();
                    
                    Log.d("CameraMultiCapture", "Current camera zoom range: " + minZoom + " - " + maxZoom);
                    
                    // Detect ultrawide by minimum zoom < 1.0
                    if (minZoom < 1.0f) {
                        hasUltrawide = true;
                        ultrawideZoomFactor = minZoom;
                        Log.d("CameraMultiCapture", "Ultrawide detected with zoom factor: " + ultrawideZoomFactor);
                    }
                    
                    // Wide camera is always available
                    hasWide = true;
                    
                    // Try to get more detailed camera info using Camera2 interop
                    try {
                        Camera2CameraInfo camera2Info = Camera2CameraInfo.from(camera.getCameraInfo());
                        String cameraId = camera2Info.getCameraId();
                        CameraManager cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
                        CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(cameraId);
                        
                        // Check for physical camera IDs (multi-camera systems)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            int[] capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
                            if (capabilities != null) {
                                for (int capability : capabilities) {
                                    if (capability == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA) {
                                        // This is a logical camera that combines multiple physical cameras
                                        Log.d("CameraMultiCapture", "Logical multi-camera detected");
                                        
                                        // More accurate telephoto detection
                                        if (maxZoom >= 5.0f) {
                                            hasTelephoto = true;
                                            // Detect common telephoto zoom factors
                                            if (maxZoom >= 20.0f) {
                                                telephotoZoomFactor = 3.0f;
                                            } else if (maxZoom >= 10.0f) {
                                                telephotoZoomFactor = 2.0f;
                                            } else {
                                                telephotoZoomFactor = 2.0f;
                                            }
                                            Log.d("CameraMultiCapture", "Telephoto detected with zoom factor: " + telephotoZoomFactor);
                                        }
                                        break;
                                    }
                                }
                            }
                        } else {
                            // Fallback for older devices
                            if (maxZoom >= 8.0f) {
                                hasTelephoto = true;
                                telephotoZoomFactor = 2.0f;
                            }
                        }
                        
                        // Get focal lengths if available
                        float[] focalLengths = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                        if (focalLengths != null && focalLengths.length > 0) {
                            Log.d("CameraMultiCapture", "Available focal lengths: " + Arrays.toString(focalLengths));
                        }
                        
                    } catch (Exception e) {
                        Log.e("CameraMultiCapture", "Error getting Camera2 info: " + e.getMessage());
                        // Fallback to simple detection
                        if (maxZoom >= 8.0f) {
                            hasTelephoto = true;
                            telephotoZoomFactor = 2.0f;
                        }
                    }
                }
            } else if (cameraProvider != null) {
                // Camera not initialized, try to check available cameras
                List<androidx.camera.core.CameraInfo> cameraInfoList = cameraProvider.getAvailableCameraInfos();
                for (androidx.camera.core.CameraInfo cameraInfo : cameraInfoList) {
                    androidx.camera.core.ZoomState zoomState = cameraInfo.getZoomState().getValue();
                    if (zoomState != null) {
                        float minZoom = zoomState.getMinZoomRatio();
                        float maxZoom = zoomState.getMaxZoomRatio();
                        
                        if (minZoom < 1.0f && !hasUltrawide) {
                            hasUltrawide = true;
                            ultrawideZoomFactor = minZoom;
                        }
                        
                        hasWide = true;
                        
                        if (maxZoom >= 8.0f && !hasTelephoto) {
                            hasTelephoto = true;
                        }
                    }
                }
            } else {
                // No camera provider, return defaults
                hasWide = true;
            }
            
            result.put("hasUltrawide", hasUltrawide);
            result.put("hasWide", hasWide);
            result.put("hasTelephoto", hasTelephoto);
            
            if (hasUltrawide) {
                result.put("ultrawideZoomFactor", ultrawideZoomFactor);
            }
            result.put("wideZoomFactor", wideZoomFactor);
            if (hasTelephoto) {
                result.put("telephotoZoomFactor", telephotoZoomFactor);
            }
            
            Log.d("CameraMultiCapture", "Camera detection result: ultrawide=" + hasUltrawide + 
                    ", wide=" + hasWide + ", telephoto=" + hasTelephoto);
            
        } catch (Exception e) {
            Log.e("CameraMultiCapture", "Error in getAvailableCameras: " + e.getMessage());
            // Fallback to simple detection
            result.put("hasUltrawide", false);
            result.put("hasWide", true);
            result.put("hasTelephoto", false);
            result.put("wideZoomFactor", 1.0);
        }
        
        call.resolve(result);
    }

    @PluginMethod
    public void switchToPhysicalCamera(PluginCall call) {
        Float zoomFactor = call.getFloat("zoomFactor");
        if (zoomFactor == null) {
            call.reject("Missing zoomFactor parameter");
            return;
        }
        
        if (camera == null) {
            call.reject("Camera not initialized");
            return;
        }
        
        Log.d("CameraMultiCapture", "Switching to physical camera with zoom factor: " + zoomFactor);
        
        // For CameraX, we primarily use zoom to switch between lenses
        // The system automatically switches physical cameras based on zoom level
        getActivity().runOnUiThread(() -> {
            try {
                camera.getCameraControl().setZoomRatio(zoomFactor);
                
                // Log the actual zoom after setting
                androidx.camera.core.ZoomState zoomState = camera.getCameraInfo().getZoomState().getValue();
                if (zoomState != null) {
                    Log.d("CameraMultiCapture", "Zoom set to: " + zoomState.getZoomRatio());
                }
                
                call.resolve();
            } catch (Exception e) {
                Log.e("CameraMultiCapture", "Failed to switch camera: " + e.getMessage());
                call.reject("Failed to switch camera: " + e.getMessage(), e);
            }
        });
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

        getActivity().runOnUiThread(() -> {
            try {
                if (imageCapture != null) {
                    imageCapture.setFlashMode(flashModeInt);
                    
                    JSObject result = new JSObject();
                    result.put("flashMode", flashMode);
                    call.resolve(result);
                } else {
                    call.reject("ImageCapture not initialized");
                }
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

    @PluginMethod
    public void setTorch(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Missing enabled parameter");
            return;
    }

    getActivity().runOnUiThread(() -> {
        try {
            if (camera == null) {
                call.reject("Camera not initialized");
                return;
            }

            // Torch is controlled via CameraX CameraControl to ensure proper lifecycle handling.
            camera.getCameraControl().enableTorch(enabled);
            torchEnabled = enabled;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set torch: " + e.getMessage(), e);
        }
    });
}

    @PluginMethod
    public void getTorch(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", torchEnabled);
        call.resolve(result);
    }

    private void startOrientationListener() {
        if (orientationEventListener == null) {
            orientationEventListener = new OrientationEventListener(getContext()) {
                @Override
                public void onOrientationChanged(int orientation) {
                    if (orientation == ORIENTATION_UNKNOWN) return;
                    
                    int newOrientation;
                    if (orientation >= 315 || orientation < 45) {
                        newOrientation = 0;
                    } else if (orientation >= 45 && orientation < 135) {
                        newOrientation = 270;
                    } else if (orientation >= 135 && orientation < 225) {
                        newOrientation = 180;
                    } else {
                        newOrientation = 90;
                    }
                    
                    if (newOrientation != lastKnownOrientation) {
                        lastKnownOrientation = newOrientation;
                    }
                }
            };
        }
        
        if (orientationEventListener.canDetectOrientation()) {
            orientationEventListener.enable();
        } else {
            Log.w("CameraMultiCapture", "Cannot detect device orientation");
        }
    }

    private void stopOrientationListener() {
        if (orientationEventListener != null) {
            orientationEventListener.disable();
        }
    }

    private int getRotationFromOrientation(int orientation) {
        switch (orientation) {
            case 0:
                return Surface.ROTATION_0;
            case 90:
                return Surface.ROTATION_90;
            case 180:
                return Surface.ROTATION_180;
            case 270:
                return Surface.ROTATION_270;
            default:
                return Surface.ROTATION_0;
        }
    }

}
