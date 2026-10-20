# iPhone 11 screen check

Status: **UNKNOWN**. No iPhone 11 is connected to this environment. Desktop checks do not establish iOS Safari rendering, device frame rate, home-screen behavior, or offline reload.

1. Open the GitHub Pages URL in iPhone 11 Safari in landscape. Compare the face size and placement with the supplied reference; check both notch orientations and the safe edges.
2. Tap once and rotate the device. Confirm the face remains centered and no debug UI appears.
3. Add the page to the Home Screen, launch it, then use `?debug=1` during a separate check to exercise each expression, blink, gaze, and mouth motion. Read the measured FPS output after it settles.
4. Load the page once, enable Airplane Mode, close and reopen the Home Screen app, then check that the face and PNG assets still render.
5. Record model/iOS version, Safari vs Home Screen mode, observations, and PASS/FAIL/UNKNOWN for each item before Phase 2.

The web manifest requests landscape and fullscreen display, but iOS Safari may ignore orientation locking. If the device or runtime cannot be accessed, keep all device results as UNKNOWN.
