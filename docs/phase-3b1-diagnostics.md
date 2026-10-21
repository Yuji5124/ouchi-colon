# Phase 3B.1 audio diagnostics

## Source-confirmed findings

- Before this change, `SpeechSynthesisEngine` marked speech active as soon as `speak()` was queued. That could make the debug UI and mouth animation claim playback before `SpeechSynthesisUtterance.onstart`.
- Voice selection only queried `getVoices()` at engine construction and at speak time. It did not observe `voiceschanged`, retain an exposed utterance reference, or detect a request that never started.
- `main.ts` simulated `RESPONSE_STARTED` after 350 ms when TTS was disabled, unsupported, or failed to start. That could show TALK without audio.
- Recognition is deliberately one-shot (`continuous = false`); the adapter does not automatically retry. A final transcript is delivered only from the recognition `onend` event, and interim text is not passed to ConversationEngine.
- Before this change, a final voice result aborted recognition and scheduled one 180 ms restart after the response, but no restart status was surfaced. A failed TTS path could also falsely appear to finish normally.

These are code-path facts. They do not establish the root cause of the reported iPhone playback failure.

## Changes

- The synthesis engine tracks pending separately from speaking; speaking becomes true only on the actual utterance `onstart` event. It retains the current utterance until completion/cancel, observes `voiceschanged`, prefers exact `ja-JP` then other Japanese voices, and falls back to an utterance tagged `ja-JP`.
- A 10 second start watchdog reports an error and cancels a request with no `onstart`. `onend` before `onstart` is treated as a playback failure.
- The debug-only 「コロンの声をテスト」 button calls the SpeechSynthesis API directly from the user's click event. A parent confirmation checkbox is required. The test stops recognition and does not automatically resume it.
- TALK and procedural mouth movement begin only on `onstart`; all terminal events stop the mouth. Utterance boundaries are not treated as phoneme timing.
- Voice replies trigger one controlled recognition restart after TTS termination. A user stop, permission failure, or failed restart does not create an automatic retry loop; the debug panel asks the parent to press Start again.
- In-memory diagnostics show 13 pipeline stages and a bounded 20-entry history. Transcript contents are omitted from this history; existing interim/final debug fields remain transient in the page only.
- A concurrency line shows camera, detector, recognition, TTS, and measured rendering FPS state.

## iOS/Safari facts and unknowns

- Web Speech APIs are browser/OS services. This project invokes `speak()` only after an explicit button/submit gesture and sets `lang=ja-JP`; the selected voice depends on the voices supplied by the device.
- The app observes `voiceschanged` and displays local pending/speaking state beside browser `pending`, `speaking`, and `paused` flags. It does not claim that a voice is installed merely because the utterance language is Japanese.
- Recognition and TTS are serialized: recognition is aborted before a reply is spoken; the next one-shot recognition is requested after TTS ends. Safari event ordering and permission behavior can vary by iOS version.
- UNKNOWN until tested on the target iPhone: whether iOS 17 Safari supplies a Japanese voice, whether the test utterance audibly plays, whether `onstart`/`onend` fire, whether browser voice playback needs network access, whether the Web Speech recognizer can be restarted without another gesture, and whether camera + recognition + TTS sustain acceptable performance/thermal load.
- No iPhone 11 is connected to this development environment. Camera and audio coexistence is instrumented, but not device-validated here.

## Device test sequence

1. Open `?debug=1`, check the TTS confirmation, tap 「コロンの声をテスト」 once, and verify audible Japanese, `onstart`, TALK/mouth movement, then `onend` and IDLE.
2. Start microphone explicitly, say 「こんにちは」, and verify final recognition, conversation input, generated reply, TTS events, mouth stop, then one recognition restart.
3. Repeat with TTS disabled, cancel during playback, deny/revoke microphone permission, and check that no automatic restart happens after Stop.
4. Only after voice-only success, enable camera/detection and repeat. Compare measured FPS and record any heat, stalls, or permission conflicts.

No real device playback or GitHub Pages audio test is represented as PASS by this document.
