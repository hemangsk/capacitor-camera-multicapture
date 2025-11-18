package dev.hemang.cameramulticapture;

import android.graphics.Bitmap;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;

public class ThumbnailGenerator {
    
    private static final String TAG = "ThumbnailGenerator";
    private static final int DEFAULT_THUMBNAIL_SIZE = 200;
    
    /**
     * Generate a thumbnail from an already orientation-corrected image file
     * @param imageFile Image file (must already have corrected orientation)
     * @param thumbnailSize Target thumbnail size
     * @return Base64 data URI of thumbnail
     */
    public static String generateThumbnail(File imageFile, int thumbnailSize) {
        return ImageUtils.generateThumbnail(imageFile, thumbnailSize);
    }
    
    /**
     * Generate a thumbnail with default size
     * @param imageFile Image file
     * @return Base64 data URI of thumbnail
     */
    public static String generateThumbnail(File imageFile) {
        return generateThumbnail(imageFile, DEFAULT_THUMBNAIL_SIZE);
    }
    
    /**
     * Convert bitmap to Base64 data URI
     * @param bitmap Source bitmap
     * @param quality JPEG quality (0-100)
     * @return Base64 data URI string
     */
    public static String bitmapToBase64(Bitmap bitmap, int quality) {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream);
        byte[] bytes = outputStream.toByteArray();
        
        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        return "data:image/jpeg;base64," + base64;
    }
}