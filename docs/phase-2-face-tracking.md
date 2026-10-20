# Phase 2: face detection and gaze tracking

## Current implementation

- Face tracking is opt-in from the hidden debug panel (`?debug=1` → **カメラで顔追跡を開始**). The ordinary face screen contains no camera controls.
- The browser asks for the front camera only after the user presses Start. No audio track is requested.
- MediaPipe Tasks Vision Face Detector 1.1.1 runs with the CPU delegate and samples video at up to 5 frames per second.
- The highest-confidence face box is converted to normalized center coordinates and drives gaze. Losing the face selects SEARCH; finding it again briefly selects HAPPY.
- The camera stream is processed in memory. Frames, face crops, and coordinates are not saved or sent to a server. Stopping, hiding the page, closing debug, or leaving the page stops the camera tracks.
- The preview is hidden; the operating system's camera-use indicator remains the user's permission/status signal.

## Runtime assets and offline behavior

The detector package is licensed Apache-2.0. On first start, the app loads the vision WebAssembly runtime from the version-pinned jsDelivr package and the BlazeFace short-range model from MediaPipe's versioned Google Cloud Storage URL. The first use needs a network connection and transfers about 15 MB. The updated Service Worker caches only these two approved origins after a successful fetch. A later offline start can use those cached resources; this has been verified with a mocked Service Worker test, not on an iPhone.

## Device checks still needed

- Camera permission and front-camera selection in iPhone 11 Safari and Home Screen mode.
- Detector loading and first-use download time on a real network.
- Actual detection rate, UI frame rate, heat, and battery use on iPhone 11.
- Stop/restart behavior after Safari backgrounds the page or the user denies permission.
- Face tracking after a first successful online run with Airplane Mode enabled.

Do not treat these iPhone checks as PASS until observed on the device.
