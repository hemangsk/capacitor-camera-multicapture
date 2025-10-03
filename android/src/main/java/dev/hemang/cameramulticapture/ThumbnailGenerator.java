package dev.hemang.cameramulticapture;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.ThumbnailUtils;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;


public class ThumbnailGenerator {
    
    private static final String TAG = "ThumbnailGenerator";
    private static final int DEFAULT_THUMBNAIL_SIZE = 200;
    private static final int THUMBNAIL_QUALITY = 85;
    
    /**
     * Generates a thumbnail using Android's native ThumbnailUtils
     */
    public static String generateThumbnail(File imageFile, int thumbnailSize) {
        if (imageFile == null || !imageFile.exists()) {
            Log.e(TAG, "Image file does not exist");
            return null;
        }
        
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = calculateSampleSize(imageFile, thumbnailSize * 2); // Load at 2x thumbnail size for quality
            
            Bitmap originalBitmap = BitmapFactory.decodeFile(imageFile.getAbsolutePath(), options);
            if (originalBitmap == null) {
                Log.e(TAG, "Failed to decode image file");
                return null;
            }
            
            Bitmap thumbnail = ThumbnailUtils.extractThumbnail(
                originalBitmap, 
                thumbnailSize, 
                thumbnailSize,
                ThumbnailUtils.OPTIONS_RECYCLE_INPUT
            );
            
            if (thumbnail == null) {
                Log.e(TAG, "Failed to generate thumbnail");
                return null;
            }
            
            String base64Thumbnail = bitmapToBase64(thumbnail, THUMBNAIL_QUALITY);
            thumbnail.recycle();
            
            return base64Thumbnail;
            
        } catch (Exception e) {
            Log.e(TAG, "Error generating thumbnail: " + e.getMessage(), e);
            return null;
        }
    }
    
    /**
     * Generates a thumbnail with default size
     */
    public static String generateThumbnail(File imageFile) {
        return generateThumbnail(imageFile, DEFAULT_THUMBNAIL_SIZE);
    }
    
    /**
     * Calculate sample size for efficient loading
     */
    private static int calculateSampleSize(File imageFile, int targetSize) {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(imageFile.getAbsolutePath(), options);
        
        int sampleSize = 1;
        int maxDimension = Math.max(options.outWidth, options.outHeight);
        
        while (maxDimension / sampleSize > targetSize) {
            sampleSize *= 2;
        }
        
        return sampleSize;
    }
    
    /**
     * Convert bitmap to Base64 data URI
     */
    private static String bitmapToBase64(Bitmap bitmap, int quality) {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream);
        byte[] bytes = outputStream.toByteArray();
        
        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        return "data:image/jpeg;base64," + base64;
    }
}