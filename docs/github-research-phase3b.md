# OuchiColon Phase 3B — GitHub research and implementation notes

**Research date:** 2026-10-21. Repository activity and the visible issue/PR queues below are a point-in-time snapshot, not a maintenance guarantee. A README claim is not evidence that a library works on an iPhone 11.

## 1. Existing application and constraints

The local `main` checkout was fetched and compared with `origin/main`; both were at the Phase 3A commit when this work began. Existing tests covered the `ReactionEngine`, 100-rule in-memory `ConversationEngine`, `SpeechSynthesisEngine`, `FaceTrackingInput`, Canvas/PNG expressions, face tracker failures, and service-worker caching. GitHub Pages is built by `.github/workflows/pages.yml` on pushes to `main` using `npm ci` and `npm run build`.

Phase 3B keeps those systems and adds one speech-recognition adapter. The existing face assets, renderer, face tracker, eight expressions, rule replies, speech-synthesis wrapper, and dependencies remain in place. No model, recognition service, or third-party code was added to the application bundle.

## 2. Candidate repositories explored

Ten repositories were inspected using their GitHub repository page, default-branch README/license/package metadata, latest-commit Atom feed, and open issue/PR pages. Visible issue rows are a page, not an exact count; counts are marked UNKNOWN if GitHub did not expose them in the page data. Open PR counts are the values exposed by GitHub when queried. An issue count or open PR count does not establish whether a project is healthy; recent issues were not individually adjudicated for severity.

| Repository | What it offers and possible OuchiColon use | License | Latest visible commit | Issues / PR snapshot | Decision |
|---|---|---|---|---|---|
| [ricky0123/vad](https://github.com/ricky0123/vad) | Browser speech-segment callbacks using a Silero VAD model, ONNX Runtime Web, and audio worklet processing. Could signal voice onset before ASR text. Model/runtime downloads and an additional microphone/audio pipeline would be needed. README does not establish iPhone 11 performance or pediatric accuracy. | ISC; model/runtime assets have their own license and distribution terms to check. | 2026-09-12 | 25 visible open issues (total UNKNOWN), 6 open PRs; first visible issue row is #261 about context with v5. | **Hold for benchmark.** Good candidate if the native speech events are too late or absent. Not included in this phase. |
| [JamesBrill/react-speech-recognition](https://github.com/JamesBrill/react-speech-recognition) | React hook around Web Speech API with browser/error handling. This app uses TypeScript/Vite without React; using the browser API directly avoids adding React and a wrapper. It cannot make Web Speech work where Safari lacks it. | MIT; package lists `lodash.debounce` and React peer integration. | 2025-04-28 | 10 visible open issues (total UNKNOWN), 8 open PRs; first visible issue row is #262 about post-build/deploy behavior. | **Do not adopt.** Useful reference, but its core capability is the same browser API and its React integration does not fit this project. |
| [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Offline and streaming ASR, VAD and TTS, including a WebAssembly build and Japanese examples/models. Strong future candidate for private on-device recognition if a suitable model is packaged. Every model needs its own size, license and quality review. | Apache-2.0 code; model licenses vary. | 2026-10-21 | 25 visible open issues (total UNKNOWN), 72 open PRs. | **Shortlist for offline prototype.** Broad and active project, but much more runtime/model and memory/thermal risk than a browser API. No iPhone 11 benchmark was available. |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | Runs ONNX-backed pipelines in a browser on CPU/WASM and, when supported, WebGPU. Could prototype Whisper or another multilingual Japanese model without a server. It is a general inference runtime rather than a streaming ASR/VAD system; model downloads and per-model licenses apply. | Apache-2.0 library; model licenses vary. | 2026-10-06 | 25 visible open issues (total UNKNOWN), 86 open PRs. | **Hold for Phase 3C research.** Flexible but likely too heavy for an initial iPhone 11 real-time conversational loop. |
| [ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp) (now under the `ggml-org` repository identity) | C/C++ Whisper inference with WebAssembly support and Japanese-capable Whisper models. README also demonstrates a native iPhone 13 app, which is not evidence for WASM in iOS Safari or iPhone 11. Usually a non-streaming chunk transcription path with substantial model download and compute. | MIT code; verify the chosen model/weights and redistribution separately. | 2026-10-19 | 25 visible open issues (total UNKNOWN), 179 open PRs. | **Research candidate only.** Do not add to this small Phase 3B build; benchmark latency, memory and heat before reconsidering. |
| [alphacep/vosk-api](https://github.com/alphacep/vosk-api) | Offline streaming ASR with Japanese among listed languages. README describes compact models around 50 MB, but browser deployment is not the primary API path and actual model quality/size varies. | Apache-2.0 code; model license varies. | 2026-10-15 | 25 visible open issues (total UNKNOWN), 51 open PRs. | **Hold.** Japanese offline option, but verify the exact browser build, current model and Safari integration before choosing it. |
| [ccoreilly/vosk-browser](https://github.com/ccoreilly/vosk-browser) | Browser Worker wrapper around Vosk WebAssembly; potentially avoids a server after model assets are cached. A visible open issue is #94, “Creating recognizer Error.” | **UNKNOWN** from the inspected repository metadata; do not vendor until confirmed. Vosk model license also varies. | 2022-12-25 | 25 visible open issues (total UNKNOWN), 4 open PRs. | **Reject for production now.** Old last visible commit and unresolved integration/model questions. Useful as a historical browser-WASM example. |
| [GoogleChromeLabs/web-audio-samples](https://github.com/GoogleChromeLabs/web-audio-samples) | AudioWorklet and Web Audio examples useful for learning low-latency capture/processing patterns. It is an example collection, not an ASR product. | Apache-2.0 for the example source inspected. | 2026-09-19 | 5 visible open issues (total UNKNOWN), 8 open PRs; first visible issue row concerns large recorder buffering. | **Reference only.** No code copied. Avoid a large ScriptProcessor-style/full-buffer design for real-time use. |
| [mozilla/DeepSpeech](https://github.com/mozilla/DeepSpeech) | Older offline ASR project; not a current Safari streaming solution. | MPL-2.0. | 2025-06-19 | 25 visible open issues (total UNKNOWN), 25 open PRs; current issue queue contains unrelated/spam-looking entries. | **Reject.** Maintenance and browser/iPhone fit are poor. |
| [coqui-ai/STT](https://github.com/coqui-ai/STT) | Older offline STT fork, possible historical model/conversion reference. | MPL-2.0. | 2021-03-03 | 25 visible open issues (total UNKNOWN), 17 open PRs; visible issue includes obsolete package/install failures. | **Reject.** Stale repository and no compelling iOS Safari path. |

### Shortlist (4)

1. **Browser Web Speech API, accessed directly** — best first integration because it has no new bundle/model and provides Japanese language, interim results, and speech lifecycle events where the browser implements them. This is an API rather than a GitHub library; [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json) lists Safari's `webkit` prefix from 14.1 and iOS Safari as mirroring Safari. That compatibility record is not a real device run. Recognition may require network service, can fail with permission/network errors, and is not guaranteed offline.
2. **ricky0123/vad** — valuable for a later independent onset benchmark. Silero VAD detects speech segments; it does not determine that a voice belongs to the child and its accuracy for young Japanese speakers is UNKNOWN. Its ONNX/worklet/model cost and another mic capture path need testing on target hardware.
3. **sherpa-onnx** — strongest researched offline/streaming alternative, with Japanese WASM examples. Exact Japanese model performance, asset size and iPhone Safari thermal cost are UNKNOWN until a specific model is benchmarked.
4. **whisper.cpp / Transformers.js** — useful model-runtime comparisons for an offline prototype. Both bring an inference runtime/model and are higher-risk for response time and battery than using the browser's available recognizer. They remain research-only.

The React wrapper, Vosk browser wrapper, generic AudioWorklet sample collection, DeepSpeech and Coqui STT were not adopted. No GitHub source code was copied into OuchiColon; therefore this change adds no third-party source-license obligation. Existing app dependencies remain exactly as before.

## 3. Combination hypothesis and smallest verification plan

The low-dependency path now used is:

```text
parent checks online-recognition notice and taps Start
  → one Japanese Web Speech recognition turn (interim text + speech events)
  → ReactionEngine reacts on the browser speech-start event
  → final text is passed to the existing in-memory RuleBasedConversationEngine
  → SpeechSynthesisEngine speaks the reply
  → recognition is aborted during TTS to prevent self-recognition
  → one deliberate new recognition turn starts after TTS (or parent stops it)
```

This avoids a second microphone/VAD pipeline while the browser already emits speech-start/end events. It should reduce implementation and bundle cost. Hypothesis only: if browser speech events are unavailable or too slow, VAD could run separately on a downsampled mic stream to trigger a quick facial response, while the browser recognizer supplies text. The two paths must share a single explicit mic grant, suppress detection while TTS plays, stop with page visibility changes, and be benchmarked for duplicate events and audio-session conflicts. No such combination has been validated on an iPhone 11.

Minimal browser experiment: open `?debug=1`, read and check the parent notice, start the microphone, verify the browser permission prompt, speak one short Japanese sentence, inspect interim/final text and reaction ordering, hear one response if TTS was separately enabled, then verify recognition is not active during that response. Test deny, offline, unsupported API, Stop, backgrounding Safari, and restart. Record phone/iOS/Safari version, first-turn time, speech-event-to-expression handler time, final-recognition time, utterance-end-to-TTS time, render FPS, and device heat.

## 4. Phase 3B implementation and privacy boundary

`SpeechRecognitionEngine` is a small interface adapter for `SpeechRecognition` and `webkitSpeechRecognition`. It is constructed only when the runtime supports a constructor and is started only by the debug start-button event after the parent confirmation checkbox is checked. It uses `ja-JP`, `interimResults`, and one-shot turns (`continuous = false`); it has no autonomous retry loop. A final turn can re-arm once after TTS while the explicit parent-enabled session remains active. A no-speech/error turn stops and requires another start action. Unsupported browsers retain typed testing.

Before TTS, recognition is aborted and its callbacks invalidated. Speech output uses the existing `SpeechSynthesisEngine`; its boundary events animate the existing mouth state. The existing `RuleBasedConversationEngine` receives final text; interim text is displayed only in the debug panel and is not sent to conversation generation or spoken. Text, final result and topic context remain in page memory, are cleared when debug closes/reloads, and are not written to storage by this feature. The application does not save audio or video. The Web Speech implementation may send audio to a browser/vendor online recognition service; parent-facing disclosure is shown before opt-in. That service's exact transport, retention and provider are **UNKNOWN** and depend on iOS/Safari configuration.

The timing field “音声イベント→表情” measures JavaScript handling time between receipt of the browser `speechstart` event and applying the reaction. It does **not** measure microphone/audio capture latency or physical voice-onset-to-reaction latency. Those remain **UNKNOWN** without device instrumentation.

## 5. Benchmark results

* External library/model benchmark on an iPhone 11: **UNKNOWN**; none was added or run.
* Safari recognition latency, Japanese recognition quality for 4–5-year-old voices, recognition network behavior, offline behavior, CPU/RAM/battery, and heat: **UNKNOWN** until real-device checks.
* Automated tests cover mock Web Speech lifecycle, interim changes, finalization, permission denial, abort/stale-event suppression, unsupported-browser fallback, the existing reaction/conversation/TTS behavior, and face/event priority. These tests do not emulate Safari's ASR service or microphone.
* `npm ci`: passed (17 packages installed; lockfile unchanged).
* `npm test`: passed, 41 tests total (the existing 35 remain; 6 recognition-adapter tests were added).
* `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
* Vite's production build emitted a 44.99 kB JavaScript application chunk (15.38 kB gzip) plus the existing 154.81 kB face-tracker chunk (46.24 kB gzip). The new speech adapter adds no model or library chunk. These are build artifact sizes, not CPU or latency benchmarks.
* GitHub Pages workflow run [#13](https://github.com/Yuji5124/ouchi-colon/actions/runs/39548343351) completed successfully for commit `797703a`. The deployed app URL is expected to be [https://yuji5124.github.io/ouchi-colon/](https://yuji5124.github.io/ouchi-colon/). An HTTP 200 check from this executor is **UNKNOWN** because the restricted HTTP policy does not allow direct requests to the `github.io` host.

## 6. Next research questions

1. On iPhone 11, does Safari 14.1+ `webkitSpeechRecognition` start reliably from a parent gesture, provide `speechstart`/`speechend`, and permit one re-arm after TTS? Capture exact device iOS/Safari version.
2. Does a 16 kHz VAD model (`ricky0123/vad`) improve time-to-expression compared with native speech events enough to justify ONNX/WASM, model downloads and another audio path? Measure warm/cold start, CPU, memory, frame drops, and battery for several child-like Japanese samples; do not store samples.
3. If online ASR quality is insufficient, benchmark one Japanese streaming `sherpa-onnx` model against a Vosk model and whisper.cpp/Transformers.js on-device. Record license for source, model and tokenizer separately, model bytes, cache behavior, first-token/partial latency, memory ceiling, sustained heat and offline restart.
4. Investigate browser/provider privacy controls and whether a parent-visible, revocable consent can be made clearer without exposing normal-screen UI.

## Sources

* https://github.com/ricky0123/vad
* https://github.com/JamesBrill/react-speech-recognition
* https://github.com/k2-fsa/sherpa-onnx
* https://github.com/huggingface/transformers.js
* https://github.com/ggml-org/whisper.cpp
* https://github.com/alphacep/vosk-api
* https://github.com/ccoreilly/vosk-browser
* https://github.com/GoogleChromeLabs/web-audio-samples
* https://github.com/mozilla/DeepSpeech
* https://github.com/coqui-ai/STT
* https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
