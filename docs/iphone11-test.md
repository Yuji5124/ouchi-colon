# iPhone 11 screen check

User reports that they completed the iPhone screen check and confirmed the updated face looked cute. The iPhone model details, iOS version, Safari/Home Screen mode, and per-check observations were not provided, so technical results below remain **UNKNOWN** unless explicitly recorded by the user.

1. Open the GitHub Pages URL in iPhone 11 Safari in landscape. Compare the face size and placement with the supplied reference; check both notch orientations and the safe edges.
2. Tap once and rotate the device. Confirm the face remains centered and no debug UI appears.
3. Add the page to the Home Screen, launch it, then use `?debug=1` during a separate check to exercise each expression, blink, gaze, and mouth motion. Read the measured FPS output after it settles.
4. Load the page once, enable Airplane Mode, close and reopen the Home Screen app, then check that the face and PNG assets still render.
5. Record model/iOS version, Safari vs Home Screen mode, observations, and PASS/FAIL/UNKNOWN for each item. Keep unreported checks as UNKNOWN.
6. With `?debug=1`, press **カメラで顔追跡を開始**, grant permission, move left/right, move out of view, then stop. Repeat after one online detector load with Airplane Mode on to check the cached model/runtime.

The web manifest requests landscape and fullscreen display, but iOS Safari may ignore orientation locking. Camera permission, face detection cadence, thermal behavior, and offline model loading still require hands-on iPhone 11 checks.
