# Button Opacity Support

The camera multi-capture plugin now supports opacity control for all button styles, allowing you to create semi-transparent or fully opaque buttons.

## Usage

Add the `opacity` property to any button's style configuration:

### Example: Semi-transparent buttons

```typescript
const result = await CameraMultiCapture.start({
  containerId: 'camera-container',
  buttons: {
    capture: {
      style: {
        backgroundColor: '#ffffff',
        opacity: 0.8 // 80% opacity
      }
    },
    done: {
      style: {
        backgroundColor: '#28a745',
        color: '#ffffff',
        opacity: 0.9 // 90% opacity
      }
    },
    cancel: {
      style: {
        backgroundColor: '#dc3545',
        color: '#ffffff',
        opacity: 0.7 // 70% opacity
      }
    },
    switchCamera: {
      style: {
        backgroundColor: '#000000',
        color: '#ffffff',
        opacity: 0.6 // 60% opacity
      }
    },
    flash: {
      style: {
        backgroundColor: '#000000',
        color: '#ffffff',
        opacity: 0.5 // 50% opacity
      }
    }
  }
});
```

### Example: Fully opaque buttons

```typescript
const result = await CameraMultiCapture.start({
  containerId: 'camera-container',
  buttons: {
    capture: {
      style: {
        backgroundColor: '#ffffff',
        opacity: 1.0 // Fully opaque (default)
      }
    }
  }
});
```

## Opacity Values

- **Range**: `0` to `1`
- **0**: Completely transparent (invisible)
- **0.5**: 50% transparent
- **1**: Completely opaque (default)

## Notes

- If `opacity` is not specified, buttons default to fully opaque (`opacity: 1`)
- Opacity affects the entire button including background, text, and icons
- Works with all existing button style properties
- Useful for creating overlay effects or subtle UI elements
