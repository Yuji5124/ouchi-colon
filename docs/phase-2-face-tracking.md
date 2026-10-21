# Phase 2: face detection and gaze tracking

## Current implementation

- Face tracking is opt-in from the hidden debug panel (`?debug=1`). Camera and face detection have separate ON/OFF buttons; the ordinary face screen contains no camera controls.
- The browser asks for the front camera only after the user presses **カメラON**. No audio track is requested. The hidden video element is not displayed; no frames, face crops, or coordinates are saved or sent to a server.
- MediaPipe Tasks Vision Face Detector 1.1.1 runs with the CPU delegate at up to 640×480 input and samples video at a target 5 frames per second. Drawing remains scheduled at a target 30 frames per second.
- The highest-confidence face box is converted to normalized center coordinates. Two consecutive detections acquire a face; a 400 ms grace period absorbs short misses. A dead zone suppresses small center jitter, optional horizontal mirroring reverses gaze direction, and exponential smoothing moves the gaze without jumps. Losing a face returns gaze to center and selects SEARCH; stable reacquisition briefly selects HAPPY once.
- Debug output shows camera/detector state, normalized face X/Y, applied gaze, horizontal mirroring, render FPS, detector FPS, and detector processing latency. **顔を見る** minimizes the panel without stopping tracking.
- Stopping the camera, hiding the page, closing debug, or leaving the page stops detection and camera tracks. The normal face animation continues with camera OFF.

## Runtime assets and offline behavior

The detector package is licensed Apache-2.0. On first start, the app loads the vision WebAssembly runtime from the version-pinned jsDelivr package and the BlazeFace short-range model from MediaPipe's versioned Google Cloud Storage URL. The first use needs a network connection and transfers about 15 MB. The Service Worker caches the model and runtime resources after a successful fetch. Automated tests simulate subsequent offline reads of the app shell, PNGs, model, WASM loader, and WASM binary. This is not an iPhone offline check.

## Device checks still needed

- Camera permission, front-camera selection, and whether the iPhone 11 case blocks the camera in Safari and Home Screen mode.
- Detector loading and first-use download time on a real network.
- Actual detection rate, UI frame rate, tracking direction/mirroring, heat, and battery use on iPhone 11.
- Stop/restart behavior after Safari backgrounds the page or the user denies permission.
- Face tracking after a first successful online run with Airplane Mode enabled.

Do not treat these iPhone checks as PASS until observed on the device.
