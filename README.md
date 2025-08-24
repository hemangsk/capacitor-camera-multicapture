# camera-multi-capture

Capacitor plugin that lets the user Capture multiple photos with a customizable UI overlay in a single camera session

## Install

```bash
npm install camera-multi-capture@github:hemangsk/capacitor-camera-multicapture
npx cap sync
```

## Configuration

### iOS (Info.plist)

Add the following permissions to your iOS app's `Info.plist` file:

```xml
<key>NSCameraUsageDescription</key>
<string>This app needs access to camera to capture photos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs access to photo library to save captured images</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>This app needs access to photo library to save captured images</string>
```

### Android (AndroidManifest.xml)

The plugin automatically adds the necessary permissions to your Android app. However, if you need to declare them explicitly, add these to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### Permission Handling

Before using the camera, check and request permissions:

```typescript
import { CameraMultiCapture } from 'camera-multi-capture';

// Check current permissions
const permissions = await CameraMultiCapture.checkPermissions();

if (permissions.camera !== 'granted' || permissions.photos !== 'granted') {
  // Request permissions
  const result = await CameraMultiCapture.requestPermissions();
  
  if (result.camera !== 'granted') {
    console.error('Camera permission denied');
    return;
  }
}

// Now you can safely use the camera
const cameraResult = await CameraMultiCapture.start(options);
```

## Demo

https://github.com/hemangsk/capacitor-multi-preview-demo

## Usage

```typescript
import { initialize, CameraOverlayResult } from 'camera-multi-capture';

const result = await initialize({
  containerId: 'camera-overlay',
  quality: 90,
  thumbnailStyle: {
    width: '100px',
    height: '100px'
  },

  /** more options */
}).then((result: CameraOverlayResult) => {
  if (result.cancelled) {
    console.log('User cancelled the camera overlay');
  } else {
    console.log('Captured images:', result.images);
  }

  // normally you'd want go back to previous screen

  // this.navCtrl.pop();
  // this.navCtrl.navigateBack();
});

// Single capture mode example - returns immediately after one photo
const singleResult = await initialize({
  containerId: 'camera-overlay',
  quality: 90,
  maxCaptures: 1  // Automatically returns after capturing one image
}).then((result: CameraOverlayResult) => {
  if (!result.cancelled && result.images.length > 0) {
    console.log('Single image captured:', result.images[0]);
  }
});
```

```html
<div id="camera-overlay"></div>
```

```css
#camera-overlay {
  width: 100%; // or any other value for custom container
  height: 100%;

   background-color: transparent !important;
  --background: transparent !important;
  --ion-background-color: transparent !important;
}
```

### Examples

#### Single Capture Mode

```typescript
// Capture only one image and return immediately
const result = await initialize({
  maxCaptures: 1,  // Single capture mode
  containerId: 'camera-container',
  quality: 90
});
```

#### Smart Zoom with Physical Camera Switching

The plugin automatically detects available physical cameras (ultrawide, wide, telephoto) and displays appropriate zoom buttons. The system seamlessly switches between physical cameras when you select certain zoom levels.

## API

<docgen-index>

* [`start(...)`](#start)
* [`capture()`](#capture)
* [`stop()`](#stop)
* [`switchCamera()`](#switchcamera)
* [`setZoom(...)`](#setzoom)
* [`updatePreviewRect(...)`](#updatepreviewrect)
* [`checkPermissions()`](#checkpermissions)
* [`requestPermissions()`](#requestpermissions)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### start(...)

```typescript
start(options?: CameraOverlayOptions | undefined) => Promise<CameraOverlayResult>
```

Starts the camera overlay session.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#cameraoverlayoptions">CameraOverlayOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#cameraoverlayresult">CameraOverlayResult</a>&gt;</code>

--------------------


### capture()

```typescript
capture() => Promise<{ value: CameraImageData; }>
```

Captures a single frame.

**Returns:** <code>Promise&lt;{ value: <a href="#cameraimagedata">CameraImageData</a>; }&gt;</code>

--------------------


### stop()

```typescript
stop() => Promise<void>
```

Stops and tears down the camera session.

--------------------


### switchCamera()

```typescript
switchCamera() => Promise<void>
```

Switches the camera between front and back.

--------------------


### setZoom(...)

```typescript
setZoom(options: { zoom: number; }) => Promise<void>
```

Sets the zoom level of the camera.

| Param         | Type                           |
| ------------- | ------------------------------ |
| **`options`** | <code>{ zoom: number; }</code> |

--------------------


### updatePreviewRect(...)

```typescript
updatePreviewRect(options: CameraPreviewRect) => Promise<void>
```

Updates the camera preview rectangle dimensions.
Call this when the container size changes (e.g., orientation change).

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#camerapreviewrect">CameraPreviewRect</a></code> |

--------------------


### checkPermissions()

```typescript
checkPermissions() => Promise<PermissionStatus>
```

Check camera and photo library permissions

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

--------------------


### requestPermissions()

```typescript
requestPermissions() => Promise<PermissionStatus>
```

Request camera and photo library permissions

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

--------------------


### Interfaces


#### CameraOverlayResult

| Prop            | Type                           |
| --------------- | ------------------------------ |
| **`images`**    | <code>CameraImageData[]</code> |
| **`cancelled`** | <code>boolean</code>           |


#### PermissionStatus

Permission status for the camera multi-capture plugin

| Prop         | Type                                                        |
| ------------ | ----------------------------------------------------------- |
| **`camera`** | <code>'granted' \| 'denied' \| 'prompt'</code>             |
| **`photos`** | <code>'granted' \| 'denied' \| 'prompt'</code>             |


#### CameraImageData

Structure for image data returned by the camera

| Prop         | Type                |
| ------------ | ------------------- |
| **`uri`**    | <code>string</code> |
| **`base64`** | <code>string</code> |


#### CameraOverlayOptions

| Prop                 | Type                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| **`buttons`**        | <code><a href="#cameraoverlaybuttons">CameraOverlayButtons</a></code> |
| **`thumbnailStyle`** | <code>{ width: string; height: string; }</code>                       |
| **`quality`**        | <code>number</code>                                                   |
| **`containerId`**    | <code>string</code>                                                   |
| **`previewRect`**    | <code><a href="#camerapreviewrect">CameraPreviewRect</a></code>       |
| **`direction`**      | <code><a href="#cameradirection">CameraDirection</a></code>           |
| **`captureMode`**    | <code><a href="#capturemode">CaptureMode</a></code>                   |
| **`resolution`**     | <code><a href="#resolution">Resolution</a></code>                     |
| **`zoom`**           | <code>number</code>                                                   |
| **`autoFocus`**      | <code>boolean</code>                                                  |
| **`maxCaptures`**    | <code>number</code>                                                   |


#### CameraOverlayButtons

| Prop               | Type                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **`capture`**      | <code>{ icon?: string; style?: <a href="#buttonstyle">ButtonStyle</a>; position?: 'center' \| 'left' \| 'right' \| 'custom'; }</code> |
| **`done`**         | <code>{ icon?: string; style?: <a href="#buttonstyle">ButtonStyle</a>; text?: string; }</code>                                        |
| **`cancel`**       | <code>{ icon?: string; style?: <a href="#buttonstyle">ButtonStyle</a>; text?: string; }</code>                                        |
| **`switchCamera`** | <code>{ icon?: string; style?: <a href="#buttonstyle">ButtonStyle</a>; position?: 'custom' \| 'topLeft' \| 'topRight'; }</code>       |
| **`zoom`**         | <code>{ icon?: string; style?: <a href="#buttonstyle">ButtonStyle</a>; levels?: number[]; }</code>                                    |


#### ButtonStyle

| Prop                  | Type                |
| --------------------- | ------------------- |
| **`radius`**          | <code>number</code> |
| **`color`**           | <code>string</code> |
| **`backgroundColor`** | <code>string</code> |
| **`padding`**         | <code>string</code> |
| **`size`**            | <code>number</code> |
| **`activeColor`**     | <code>string</code> |
| **`border`**          | <code>string</code> |


#### CameraPreviewRect

| Prop         | Type                |
| ------------ | ------------------- |
| **`width`**  | <code>number</code> |
| **`height`** | <code>number</code> |
| **`x`**      | <code>number</code> |
| **`y`**      | <code>number</code> |


#### Resolution

| Prop         | Type                |
| ------------ | ------------------- |
| **`width`**  | <code>number</code> |
| **`height`** | <code>number</code> |


### Type Aliases


#### ButtonStyle

Defines the style properties for camera buttons

<code>OriginalButtonStyle</code>


#### CameraDirection

<code>'front' | 'back'</code>


#### CaptureMode

<code>'minimizeLatency' | 'maxQuality'</code>

</docgen-api>


## License

MIT

## Acknowledgements

- ![isbecker](https://github.com/isbecker)'s comment at https://github.com/ionic-team/capacitor-plugins/issues/1616#issuecomment-1912900318
- Capawesome plugins repository for formatting scripts and documentation setup.
