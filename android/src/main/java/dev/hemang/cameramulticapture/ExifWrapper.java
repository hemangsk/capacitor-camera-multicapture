package dev.hemang.cameramulticapture;

import androidx.exifinterface.media.ExifInterface;
import android.util.Log;

import java.io.IOException;

/**
 * Adapted from Capacitor Camera Plugin
 * Source: https://github.com/ionic-team/capacitor-plugins/blob/main/camera/android/src/main/java/com/capacitorjs/plugins/camera/ExifWrapper.java
 * Copyright 2020-present Ionic (https://ionic.io)
 * Licensed under MIT License
 */
public class ExifWrapper {
    private static final String TAG = "ExifWrapper";
    private final ExifInterface exif;
    
    private final String[] attributes = new String[] {
        ExifInterface.TAG_APERTURE_VALUE,
        ExifInterface.TAG_ARTIST,
        ExifInterface.TAG_DATETIME,
        ExifInterface.TAG_DATETIME_DIGITIZED,
        ExifInterface.TAG_DATETIME_ORIGINAL,
        ExifInterface.TAG_EXPOSURE_TIME,
        ExifInterface.TAG_FLASH,
        ExifInterface.TAG_FOCAL_LENGTH,
        ExifInterface.TAG_GPS_ALTITUDE,
        ExifInterface.TAG_GPS_ALTITUDE_REF,
        ExifInterface.TAG_GPS_DATESTAMP,
        ExifInterface.TAG_GPS_LATITUDE,
        ExifInterface.TAG_GPS_LATITUDE_REF,
        ExifInterface.TAG_GPS_LONGITUDE,
        ExifInterface.TAG_GPS_LONGITUDE_REF,
        ExifInterface.TAG_GPS_PROCESSING_METHOD,
        ExifInterface.TAG_GPS_TIMESTAMP,
        ExifInterface.TAG_IMAGE_LENGTH,
        ExifInterface.TAG_IMAGE_WIDTH,
        ExifInterface.TAG_ISO_SPEED,
        ExifInterface.TAG_MAKE,
        ExifInterface.TAG_MODEL,
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.TAG_SUBSEC_TIME,
        ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
        ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
        ExifInterface.TAG_WHITE_BALANCE
    };
    
    public ExifWrapper(ExifInterface exif) {
        this.exif = exif;
    }
    
    public ExifWrapper(String filePath) throws IOException {
        this.exif = new ExifInterface(filePath);
    }
    
    /**
     * Copy EXIF data from this wrapper to a destination file
     * @param destFile Path to destination file
     */
    public void copyExif(String destFile) {
        if (exif == null) {
            Log.w(TAG, "Source EXIF is null, cannot copy");
            return;
        }
        
        try {
            ExifInterface destExif = new ExifInterface(destFile);
            for (String attribute : attributes) {
                String value = exif.getAttribute(attribute);
                if (value != null) {
                    destExif.setAttribute(attribute, value);
                }
            }
            destExif.saveAttributes();
            Log.d(TAG, "EXIF data copied successfully to " + destFile);
        } catch (IOException e) {
            Log.e(TAG, "Failed to copy EXIF data: " + e.getMessage(), e);
        }
    }
    
    /**
     * Reset orientation to normal (1) after physical rotation
     */
    public void resetOrientation() {
        if (exif != null) {
            try {
                exif.setAttribute(ExifInterface.TAG_ORIENTATION, 
                    String.valueOf(ExifInterface.ORIENTATION_NORMAL));
                exif.saveAttributes();
                Log.d(TAG, "EXIF orientation reset to NORMAL");
            } catch (IOException e) {
                Log.e(TAG, "Failed to reset orientation: " + e.getMessage(), e);
            }
        }
    }
    
    /**
     * Get the current orientation value
     * @return EXIF orientation value
     */
    public int getOrientation() {
        if (exif == null) {
            return ExifInterface.ORIENTATION_NORMAL;
        }
        return exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
    }
}

