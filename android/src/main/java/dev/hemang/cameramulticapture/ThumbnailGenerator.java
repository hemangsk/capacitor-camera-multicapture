package dev.hemang.cameramulticapture;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ThumbnailUtils;
import android.util.Base64;
import android.util.Log;
import androidx.exifinterface.media.ExifInterface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;


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
            int exifOrientation = getExifOrientation(imageFile);
            
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = calculateSampleSize(imageFile, thumbnailSize * 2); // Load at 2x thumbnail size for quality
            
            Bitmap originalBitmap = BitmapFactory.decodeFile(imageFile.getAbsolutePath(), options);
            if (originalBitmap == null) {
                Log.e(TAG, "Failed to decode image file");
                return null;
            }
            
            Bitmap rotatedBitmap = rotateBitmapByExif(originalBitmap, exifOrientation);
            
            Bitmap thumbnail = ThumbnailUtils.extractThumbnail(
                rotatedBitmap, 
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
    
    /**
     * Read EXIF orientation from image file
     */
    private static int getExifOrientation(File imageFile) {
        try {
            ExifInterface exif = new ExifInterface(imageFile.getAbsolutePath());
            return exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (IOException e) {
            Log.e(TAG, "Error reading EXIF orientation: " + e.getMessage());
            return ExifInterface.ORIENTATION_NORMAL;
        }
    }
    
    /**
     * Rotate bitmap according to EXIF orientation
     */
    private static Bitmap rotateBitmapByExif(Bitmap bitmap, int exifOrientation) {
        Matrix matrix = new Matrix();
        
        switch (exifOrientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
                matrix.postRotate(90);
                Log.d(TAG, "Rotating thumbnail 90°");
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                matrix.postRotate(180);
                Log.d(TAG, "Rotating thumbnail 180°");
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                matrix.postRotate(270);
                Log.d(TAG, "Rotating thumbnail 270°");
                break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                matrix.setScale(-1, 1);
                Log.d(TAG, "Flipping thumbnail horizontally");
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                matrix.setScale(1, -1);
                Log.d(TAG, "Flipping thumbnail vertically");
                break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                matrix.postRotate(90);
                matrix.postScale(-1, 1);
                Log.d(TAG, "Transposing thumbnail");
                break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                matrix.postRotate(270);
                matrix.postScale(-1, 1);
                Log.d(TAG, "Transversing thumbnail");
                break;
            case ExifInterface.ORIENTATION_NORMAL:
            default:
                Log.d(TAG, "No thumbnail rotation needed");
                return bitmap;
        }
        
        try {
            Bitmap rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotatedBitmap != bitmap) {
                bitmap.recycle();
            }
            return rotatedBitmap;
        } catch (OutOfMemoryError e) {
            Log.e(TAG, "Out of memory rotating bitmap", e);
            return bitmap;
        }
    }
}