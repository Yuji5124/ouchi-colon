# Phase 3B.2: iPhone Safari TTS investigation

## Confirmed from repository history and source

1. Latest pre-change `main` was `9e28920` (Phase 3B.1). That commit changed the app entrypoint and TTS code but did not change `public/sw.js`.
2. The worker remained `ouchicolon-shell-v10`. It precached the site root and used cache-first for same-origin GETs, including the root HTML and fingerprinted JS. As a result, a previously controlled browser could keep loading its old cached HTML and old fingerprinted app JS after a deployment if the worker script did not change and install a new shell. This is a confirmed stale-build path; we cannot prove it caused this particular phone's symptom without inspecting its Cache Storage.
3. WebKit's current `SpeechSynthesis.cpp` source has an iOS-family user-gesture restriction. `speak()` returns before queueing when a user gesture is required and is not being processed (source lines 162–175). Thus, audio requested asynchronously from a SpeechRecognition `onend` can be rejected without a queued utterance or `onstart`. This directly applies to conversation replies. The independent user-click TTS test is designed to distinguish this from failure of a gesture-triggered utterance.
4. WebKit source says `cancel()` empties the utterance queue, notifies cancellation for queued items, and may process the current error before the platform's asynchronous cancellation callback (lines 178–204). Its completion handler explicitly ignores stale callbacks from an utterance canceled before a new utterance was queued (lines 228–234). The app's direct diagnostic therefore does not call `cancel()` unless the parent selects that comparison, or presses Stop.
5. WebKit lazily obtains its voice list and invalidates the list on `voicesDidChange` before firing `voiceschanged` (lines 94–128). Its `paused` flag is separate from `speaking`; `resumeSynthesis()` only calls the platform when a current utterance exists (lines 131–148 and 208–226). A resume tap is useful only when the live browser state shows paused speech.

Source inspected: [WebKit SpeechSynthesis.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp), current `main` fetched 2026-10-21. GitHub's WebKit issue search for `speech synthesis is:issue` returned “No results matched your search.” That does not establish that no related WebKit Bugzilla report exists; Bugzilla could not be inspected under this environment's restricted host allowlist. A specific published Bugzilla defect is therefore UNKNOWN.

A related but non-authoritative application report, [hiato issue #129](https://github.com/appelgriebsch/hiato/issues/129), also describes iOS WebKit silently dropping a delayed, non-gesture `speak()` request (no queue, no `onerror`, `speaking=false`). This corroborates the source-level behavior but is not a WebKit-owned defect report and does not prove the OuchiColon device failure's cause.

## Root cause assessment

- **Confirmed stale-cache defect risk:** Phase 3B.1 did not revise the worker script/cache version, while the worker caches the root and app JS. This could explain a user continuing to run an earlier build after the 3B.1 deployment. Phone-side confirmation is UNKNOWN.
- **Confirmed iOS platform constraint:** a new `speak()` call needs user activation until WebKit has removed the restriction for that page's SpeechSynthesis object. Conversation TTS after asynchronous recognition completion may therefore be refused. This is a source-level platform behavior, not proof of what happened during the user's direct TTS test.
- **Unresolved direct-test failure:** there was no iPhone event log, OS audio route state, actual voice list, or public Pages fetch available from this restricted environment. We cannot attribute the user's once-working direct TTS and later failure to `cancel()`, voices, app code, iOS, output routing, Safari tab/PWA mode, or stale installed app without the new on-device diagnostic result.

## New diagnostic behavior

- “TTS単独診断：Web API” calls `window.speechSynthesis.speak()` directly from its own tap. It does not call the app's speech wrapper, ConversationEngine, SpeechRecognition, ReactionEngine, camera, or mouth animation.
- “TTS単独診断：アプリengine” invokes only the existing SpeechSynthesisEngine, without conversation/reaction/mouth state changes.
- Exactly one utterance is requested per tap. Concurrent diagnostics and an already speaking/pending browser queue are refused. Stop is explicit; retry requires a separate later tap.
- A/B/C select Japanese language/default voice, an explicit available Japanese voice, or no explicit language/voice. The optional cancel comparison defaults OFF. `resume()` has its own button and is attempted only when the browser reports paused.
- The diagnostics show API support, `paused/pending/speaking`, Japanese voice name/language and selected voice, `onstart/onend/onerror`, start latency, a 10-second diagnostic timeout, page visibility, Safari tab vs standalone PWA, mic/camera activity, and the responding Service Worker cache version.
- Results and a bounded event list are in page memory only. No utterance text is written to diagnostics or storage.

## Service Worker migration

The worker cache moved from v10 to v11 so the deployed worker script changes and the browser installs an updated shell. Migration copies cached face assets and external MediaPipe model/runtime files from prior `ouchicolon-shell-*` caches into v11, replaces the old root/manifest and hashed app entry JS/CSS, and deletes only prior OuchiColon caches. Unrelated Cache Storage entries are untouched. LocalStorage, IndexedDB, and other user-created data are not accessed or deleted. An updated worker taking control of an already-controlled page triggers a reload to load the new hashed app bundle.

## iPhone 11 comparison sequence

Run each comparison separately; do not tap multiple speech buttons while an utterance is active.

1. Open the debug URL in Safari. Note the Service Worker version and display mode. If the app shows an old cache version, reload once after the update completes; do not clear all website data.
2. Stop microphone and camera using their existing controls. With A selected and cancel OFF, tap “TTS単独診断：Web API”. Record whether audible speech and `onstart` happen. This is the gesture-triggered baseline.
3. Once idle, try B and C one time each. B may report no Japanese voice; that result is meaningful and does not initiate speech. A successful A/B/C requires actual audible sound plus matching lifecycle events.
4. To compare cancel, enable “cancel before” and perform exactly one A/B/C run while idle. Compare against the same condition with it OFF. Do not interrupt active speech to create a race.
5. For E, tap Stop, wait for the cancellation result and idle flags, then tap a speech test again as a new user action. For F, use Resume only if `paused=true` and a current utterance remains.
6. For G/H, keep the other media source off and test first with microphone OFF/camera OFF. Then turn on only the camera and repeat; stop it, turn on only recognition and repeat. Finally test both only after isolated runs succeed.
7. Use the app-engine button after direct tests to compare wrapper behavior. For conversation replies, first establish one direct gesture-triggered utterance on that page, then test recognition-to-reply; WebKit's user-activation rule can make async conversation playback differ from a direct click.

Phone-side audio results remain UNKNOWN until the user records audible sound and the corresponding event fields. The environment cannot access iOS device controls or the Pages hostname; it can validate source/build and GitHub Actions publication but not the phone's installed cache or audible output.
