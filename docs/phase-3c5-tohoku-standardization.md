# Phase 3C.5 — TOHOKU default, icons, and diagnostics

## Voice selection and readiness

The in-memory default voice is TOHOKU Happy. The Happy model is still initialized only by the guardian's **TOHOKU準備** action. Starting microphone conversation is rejected while the model or the explicit Web Audio confirmation is not ready. The guardian then presses **音声を有効化**, which resumes Web Audio and dynamically generates and plays the confirmation greeting. A playback event is shown as an event only; the guardian must confirm that it was audible before starting conversation.

If model initialization, confirmation playback, or a conversation generation/playback fails, the selected route changes visibly to iOS SpeechSynthesis and the failure is represented by a non-content error code. iOS can also be selected explicitly. Closing debug, hiding the page, or navigating away stops audio and microphone activity, while keeping TOHOKU as the preferred route for the next guardian activation in that page session. No voice preference, transcript, audio, video, or conversation history is persisted.

The warmed Worker remains alive after model initialization. The Service Worker shell cache is `ouchicolon-shell-v16`; activation migrates non-shell resources from the previous application cache and removes the stale app shell entries. Open JTalk's large dictionary/model files remain lazy fetched and are cached after their first successful request.

## Debug controls and support report

Frequently used voice, microphone, camera, detector, engine selection, and playback-stop controls are moved into the top quick-actions panel. The panel requires explicit consent for online browser speech recognition and spoken replies. Detailed TTS diagnosis, the 20-run benchmark, event history, and TOHOKU lab remain under collapsed details. SVG controls include Japanese text labels and maintain a 44px minimum touch target.

The support report is built from an allow-listed object: app version/commit, Service Worker version, voice/model state, microphone/camera booleans, measured generation and start latency, completed turn count, categorized error code, and fallback count. It does not accept transcript or media fields. If clipboard access fails, the same report is exposed in a selectable text region.

PWA icons at 192px and 512px are raster composites of the existing cream background, eye, highlight, cheek, and mouth PNG assets. No face source assets were changed.

## Verification

- Automated tests cover TOHOKU preference/readiness gating, explicit iOS fallback policy, diagnostic report privacy, debug-only UI presence, PWA icon sizes, and Service Worker v16 cache migration. The full existing suite remains in place.
- `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` are required before publish.
- iPhone 11 Safari confirmation of first-load consent flow, actual audibility, 20-turn continuity, camera coexistence, and PWA icon appearance remains a physical-device check and is **UNKNOWN** until performed.
