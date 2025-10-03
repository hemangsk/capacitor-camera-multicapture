package dev.hemang.cameramulticapture;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

public class GenericUploadWorker extends Worker {
    private static final String TAG = "GenericUploadWorker";
    private static final MediaType MEDIA_TYPE_JPEG = MediaType.parse("image/jpeg");
    
    private static class UploadResult {
        boolean success;
        String errorMessage;
        
        UploadResult(boolean success, String errorMessage) {
            this.success = success;
            this.errorMessage = errorMessage;
        }
    }
    
    public GenericUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }
    
    @NonNull
    @Override
    public Result doWork() {
        try {
            String jobId = getInputData().getString("jobId");
            String imageUri = getInputData().getString("imageUri");
            String uploadEndpoint = getInputData().getString("uploadEndpoint");
            String headersJson = getInputData().getString("headers");
            String formDataJson = getInputData().getString("formData");
            String method = getInputData().getString("method");
            String fileName = getInputData().getString("fileName");
            boolean deleteAfterUpload = getInputData().getBoolean("deleteAfterUpload", true);
            
            Log.d(TAG, "Starting upload job: " + jobId);
            
            UploadResult result = performHttpUpload(imageUri, uploadEndpoint, headersJson, formDataJson, method, fileName);
            
            if (result.success) {
                Log.d(TAG, "Upload completed successfully: " + jobId);
                
                if (deleteAfterUpload) {
                    try {
                        File imageFile = new File(Uri.parse(imageUri).getPath());
                        if (imageFile.exists() && imageFile.delete()) {
                            Log.d(TAG, "✅ Cleaned up file after successful upload: " + imageUri);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Failed to clean up file: " + e.getMessage());
                    }
                }
                
                return Result.success();
            } else {
                Log.e(TAG, "Upload failed: " + jobId + " - " + result.errorMessage);
                Data errorData = new Data.Builder()
                    .putString("error", result.errorMessage != null ? result.errorMessage : "Upload failed")
                    .build();
                return Result.failure(errorData);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Upload error: " + e.getMessage(), e);
            Data errorData = new Data.Builder()
                .putString("error", e.getMessage())
                .build();
            return Result.retry();
        }
    }
    
    private UploadResult performHttpUpload(String imageUri, String endpoint, String headersJson, 
                                    String formDataJson, String method, String fileName) {
        try {
            OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(45, TimeUnit.SECONDS)
                .writeTimeout(120, TimeUnit.SECONDS)
                .readTimeout(90, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .connectionPool(new okhttp3.ConnectionPool(10, 5, TimeUnit.MINUTES))
                .build();
            
            File imageFile = new File(Uri.parse(imageUri).getPath());
            if (!imageFile.exists()) {
                Log.e(TAG, "Image file not found: " + imageUri);
                return new UploadResult(false, "Image file not found: " + imageUri);
            }
            
            JSONObject headers = new JSONObject(headersJson);
            JSONObject formData = new JSONObject(formDataJson);
            
            Request.Builder requestBuilder = new Request.Builder().url(endpoint);
            
            Iterator<String> headerKeys = headers.keys();
            while (headerKeys.hasNext()) {
                String key = headerKeys.next();
                String value = headers.getString(key);
                requestBuilder.addHeader(key, value);
            }
            
            RequestBody requestBody;
            if ("PUT".equalsIgnoreCase(method)) {
                requestBody = RequestBody.create(MEDIA_TYPE_JPEG, imageFile);
            } else {
                // For POST requests, use multipart form
                MultipartBody.Builder multipartBuilder = new MultipartBody.Builder()
                    .setType(MultipartBody.FORM);
                
                Iterator<String> formKeys = formData.keys();
                while (formKeys.hasNext()) {
                    String key = formKeys.next();
                    String value = formData.getString(key);
                    multipartBuilder.addFormDataPart(key, value);
                }
                
                String finalFileName = (fileName != null && !fileName.isEmpty()) ? 
                    fileName : "photo_" + System.currentTimeMillis() + ".jpg";
                multipartBuilder.addFormDataPart("file", finalFileName,
                    RequestBody.create(MEDIA_TYPE_JPEG, imageFile));
                
                requestBody = multipartBuilder.build();
            }
            
            if ("PUT".equalsIgnoreCase(method)) {
                requestBuilder.put(requestBody);
            } else {
                requestBuilder.post(requestBody);
            }
            
            Request request = requestBuilder.build();
            try (Response response = client.newCall(request).execute()) {
                boolean success = response.isSuccessful();
                Log.d(TAG, "Upload response: " + response.code() + " - " + response.message());
                
                if (!success) {
                    String errorBody = response.body() != null ? response.body().string() : "No error details";
                    Log.e(TAG, "Upload failed with response: " + response.code() + " - " + errorBody);
                    return new UploadResult(false, "HTTP " + response.code() + ": " + response.message() + " - " + errorBody);
                }
                
                return new UploadResult(true, null);
            }
            
        } catch (java.net.ConnectException e) {
            String errorMsg = "Connection failed to Azure Blob Storage. This usually happens when uploading multiple files simultaneously. Try uploading fewer files at once.";
            Log.e(TAG, errorMsg + " Details: " + e.getMessage(), e);
            return new UploadResult(false, errorMsg);
            
        } catch (java.net.SocketTimeoutException e) {
            String errorMsg = "Upload timeout. The file may be too large or network is slow.";
            Log.e(TAG, errorMsg + " Details: " + e.getMessage(), e);
            return new UploadResult(false, errorMsg);
            
        } catch (Exception e) {
            String errorMsg = "Upload failed: " + e.getClass().getSimpleName() + " - " + e.getMessage();
            Log.e(TAG, "HTTP upload error: " + errorMsg, e);
            return new UploadResult(false, errorMsg);
        }
    }
}
