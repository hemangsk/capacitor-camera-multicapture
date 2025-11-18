package dev.hemang.cameramulticapture;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.util.Log;
import androidx.exifinterface.media.ExifInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Image orientation correction utilities
 * Adapted from Capacitor Camera Plugin
 * Source: https://github.com/ionic-team/capacitor-plugins/blob/main/camera/android/src/main/java/com/capacitorjs/plugins/camera/ImageUtils.java
 * Copyright 2020-present Ionic (https://ionic.io)
 * Licensed under MIT License
 */
public class ImageUtils {
    private static final String TAG = "ImageUtils";
    
    /**
     * Correct the orientation of an image file by reading EXIF, physically rotating, and resetting EXIF
     * @param imageFile The image file to correct
     * @return true if correction was successful or not needed, false if failed
     */
    public static boolean correctImageOrientation(File imageFile) {
        if (imageFile == null || !imageFile.exists()) {
            Log.e(TAG, "Image file does not exist");
            return false;
        }
        
        try {
            ExifWrapper exifWrapper = new ExifWrapper(imageFile.getAbsolutePath());
            int orientation = exifWrapper.getOrientation();
            
            if (orientation == ExifInterface.ORIENTATION_NORMAL || 
                orientation == ExifInterface.ORIENTATION_UNDEFINED) {
                return true;
            }
            
            Bitmap bitmap = BitmapFactory.decodeFile(imageFile.getAbsolutePath());
            if (bitmap == null) {
                Log.e(TAG, "Failed to decode image file");
                return false;
            }
            
            Bitmap rotatedBitmap = rotateBitmapByExif(bitmap, orientation);
            
            if (rotatedBitmap != bitmap) {
                FileOutputStream out = new FileOutputStream(imageFile);
                rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 95, out);
                out.flush();
                out.close();
                
                bitmap.recycle();
                rotatedBitmap.recycle();
                
                ExifWrapper newExifWrapper = new ExifWrapper(imageFile.getAbsolutePath());
                newExifWrapper.resetOrientation();
                
                return true;
            } else {
                bitmap.recycle();
                exifWrapper.resetOrientation();
                return true;
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error correcting image orientation: " + e.getMessage(), e);
            return false;
        }
    }
    
    /**
     * Rotate bitmap according to EXIF orientation
     * @param bitmap Source bitmap
     * @param exifOrientation EXIF orientation value
     * @return Rotated bitmap, or same bitmap if no rotation needed
     */
    private static Bitmap rotateBitmapByExif(Bitmap bitmap, int exifOrientation) {
        Matrix matrix = new Matrix();
        
        switch (exifOrientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
                matrix.postRotate(90);
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                matrix.postRotate(180);
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                matrix.postRotate(270);
                break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                matrix.setScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                matrix.setScale(1, -1);
                break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                matrix.postRotate(90);
                matrix.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                matrix.postRotate(270);
                matrix.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_NORMAL:
            case ExifInterface.ORIENTATION_UNDEFINED:
            default:
                return bitmap;
        }
        
        try {
            Bitmap rotatedBitmap = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true
            );
            return rotatedBitmap;
        } catch (OutOfMemoryError e) {
            Log.e(TAG, "Out of memory rotating bitmap", e);
            return bitmap;
        }
    }
    
    /**
     * Generate a thumbnail from an already orientation-corrected image file
     * @param imageFile Source image file (must already have corrected orientation)
     * @param thumbnailSize Target thumbnail size (will be square)
     * @return Base64 data URI of thumbnail, or null if failed
     */
    public static String generateThumbnail(File imageFile, int thumbnailSize) {
        if (imageFile == null || !imageFile.exists()) {
            Log.e(TAG, "Image file does not exist for thumbnail generation");
            return null;
        }
        
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = calculateSampleSize(imageFile, thumbnailSize * 2);
            
            Bitmap originalBitmap = BitmapFactory.decodeFile(imageFile.getAbsolutePath(), options);
            if (originalBitmap == null) {
                Log.e(TAG, "Failed to decode image file for thumbnail");
                return null;
            }
            
            Bitmap thumbnail = createSquareThumbnail(originalBitmap, thumbnailSize);
            originalBitmap.recycle();
            
            if (thumbnail == null) {
                Log.e(TAG, "Failed to generate thumbnail");
                return null;
            }
            
            String base64Thumbnail = ThumbnailGenerator.bitmapToBase64(thumbnail, 85);
            thumbnail.recycle();
            
            return base64Thumbnail;
            
        } catch (Exception e) {
            Log.e(TAG, "Error generating thumbnail: " + e.getMessage(), e);
            return null;
        }
    }
    
    /**
     * Create a square thumbnail by center-cropping
     * @param source Source bitmap
     * @param size Target size
     * @return Square thumbnail bitmap
     */
    private static Bitmap createSquareThumbnail(Bitmap source, int size) {
        int sourceWidth = source.getWidth();
        int sourceHeight = source.getHeight();
        
        int cropSize = Math.min(sourceWidth, sourceHeight);
        int x = (sourceWidth - cropSize) / 2;
        int y = (sourceHeight - cropSize) / 2;
        
        Bitmap croppedBitmap = Bitmap.createBitmap(source, x, y, cropSize, cropSize);
        Bitmap scaledBitmap = Bitmap.createScaledBitmap(croppedBitmap, size, size, true);
        
        if (croppedBitmap != scaledBitmap) {
            croppedBitmap.recycle();
        }
        
        return scaledBitmap;
    }
    
    /**
     * Calculate sample size for efficient loading
     * @param imageFile Image file
     * @param targetSize Target size
     * @return Sample size for BitmapFactory
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
}

