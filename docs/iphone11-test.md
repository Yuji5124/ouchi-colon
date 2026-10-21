# iPhone 11 screen check

User reports that they completed the iPhone screen check and confirmed the updated face looked cute. The iPhone model details, iOS version, Safari/Home Screen mode, and per-check observations were not provided, so technical results below remain **UNKNOWN** unless explicitly recorded by the user.

1. Open the GitHub Pages URL in iPhone 11 Safari in landscape. Compare the face size and placement with the supplied reference; check both notch orientations and the safe edges.
2. Tap once and rotate the device. Confirm the face remains centered and no debug UI appears.
3. Add the page to the Home Screen, launch it, then use `?debug=1` during a separate check to exercise each expression, blink, gaze, and mouth motion. Read the measured FPS output after it settles.
4. Load the page once, enable Airplane Mode, close and reopen the Home Screen app, then check that the face and PNG assets still render.
5. Record model/iOS version, Safari vs Home Screen mode, observations, and PASS/FAIL/UNKNOWN for each item. Keep unreported checks as UNKNOWN.
6. With `?debug=1`, press **カメラON**, grant permission, then press **顔検出ON**. Tap **顔を見る** so the face is not covered. Move left/right and confirm matching eye movement; if reversed, toggle **左右反転**. Move out of view, wait for smooth centering, then press **顔検出OFF** and **カメラOFF** separately. Record face X/Y, applied gaze, render FPS, detection FPS, and detection latency. Repeat after one online detector load with Airplane Mode on to check the cached model/runtime.
7. Under `?debug=1`, first send typed text with the read-aloud checkbox off and confirm no speech plays. If a parent accepts the displayed iOS voice-service/network notice, check it and send a short greeting. Confirm Japanese voice, TALK/mouth animation, start/end status, stop button, and timing fields. Try with camera tracking both off and on, and watch for heat or dropped frames. No microphone permission should be requested in Phase 3A.

The web manifest requests landscape and fullscreen display, but iOS Safari may ignore orientation locking. Camera permission, face detection cadence, thermal behavior, offline model loading, and iOS speech-synthesis voice availability/network behavior still require hands-on iPhone 11 checks. Speech recognition is not part of Phase 3A.
