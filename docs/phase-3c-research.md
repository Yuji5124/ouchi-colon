# Phase 3C: Cute Voice & Fast Natural Conversation

Research performed 2026-10-21 against the linked GitHub repositories and their READMEs/licenses. This is a source and documentation review, not an iPhone 11 benchmark. Repository HEAD refs below were resolved with `git ls-remote`; exact last-commit dates, Issues/PR counts, artifact memory, and physical Safari performance could not be queried from this environment and remain UNKNOWN. A successful web demo or a WebAssembly build does not establish iPhone 11 compatibility.

## Existing OuchiColon baseline

- `SpeechRecognitionEngine` creates one `ja-JP` Web Speech recognition session at a time, emits interim and final results separately, and never restarts itself.
- `SpeechSynthesisEngine` is the default reply renderer. It selects an available Japanese system voice, keeps the utterance reference through lifecycle events, and gates recognition until TTS completes.
- `RuleBasedConversationEngine` has short-lived topic/turn context only. No transcript or audio is stored in browser storage.
- The face renderer uses the existing 8 expressions and PNG assets. It does not use phoneme alignment.
- Service Worker cache was v11; Phase 3C upgrades it to v12 to ensure an updated shell and entry bundle are installed while preserving other app assets and unrelated caches.

## Candidate comparison

| Project | Findings and possible use | License notes | iPhone 11 / cost / adoption |
|---|---|---|---|
| [VOICEVOX CORE](https://github.com/VOICEVOX/voicevox_core) (`main` HEAD `723be0d`) | Native synthesis core with C API and prebuilt native libraries. Voice/style selection is attractive for a character voice. | Core code is MIT per its README/LICENSE. This does not grant blanket rights to every speaker/model; speaker-specific terms and attribution must be checked for the chosen voice. Also note older prebuilt core versions have different terms. | Not browser-native; would require a supported WASM build or a server/bridge. No verified iOS Safari build, download/runtime size, memory, or short-text latency. Research only. |
| [kokoro-js-jp](https://github.com/nerosui/kokoro-js-jp) (`main` HEAD `8eadd00`) | Japanese browser TTS using Kokoro-82M/Transformers.js ONNX plus Open JTalk WASM G2P. Offers `jf_*` and `jm_*` voices. This is the strongest isolated browser experiment candidate found. | Package declares Apache-2.0. Upstream Kokoro source and the Kokoro-82M model card are separately licensed (upstream README says Apache-2.0 weights); the Japanese G2P dictionary/HTS voice assets have their own provenance/terms and need separate verification before redistribution. Package license is not a blanket model/voice license. | README says model download is “tens of MB+”; Japanese dictionary archive ~24 MB and expands to ~107 MB (worker streams it, but runtime uses about 100 MB). Package includes ~25 MB browser assets. No iPhone 11 Safari benchmark; ONNX/WASM, memory pressure, battery, cold start, and voice quality on device UNKNOWN. Not integrated into default or experiment UI because its current footprint and runtime cost are unmeasured and could compromise continuous conversation. |
| [Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) (`master` HEAD `66de777`) | Rich Japanese expressive voice generation and style control, most useful for voice design/reference. | Repository is AGPL-3.0. A trained voice/model has separate terms and speaker consent requirements; repository code license does not clear model or voice rights. | Python/PyTorch-oriented desktop/server toolchain, not a small static Safari runtime. Model downloads, memory, mobile latency, and iPhone compatibility UNKNOWN. Research only. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (`master` HEAD `a63f821`) | Apache-2.0 toolkit with WebAssembly support, Japanese ASR/VAD models, and TTS runtime/model examples. Potential future offline ASR/VAD or TTS comparison. | Toolkit code is Apache-2.0; every pretrained ASR/TTS model has its own license and data terms. Verify per selected model. | WASM support exists, and README lists Japanese model families, but iPhone 11 Safari speed, memory, model size, streaming audio coexistence, and child speech performance are UNKNOWN. Replacing the currently working Safari ASR adds substantial risk; not adopted. |
| [vad](https://github.com/ricky0123/vad) (`master` HEAD `2e5aca9`) | Browser microphone VAD using Silero VAD with ONNX Runtime Web. Can produce speech start/end callbacks for faster visual reaction. | Package declares ISC; Silero model and ONNX Runtime have their own license notices. | Adds model/WASM assets and another microphone consumer. Simultaneous use with Safari Web Speech recognition and iPhone 11 load are not verified. VAD-only visual signalling remains a possible later comparison; not adopted in this patch. |
| [kokoro](https://github.com/hexgrad/kokoro) (`main` HEAD `dfb907a`) | Upstream Kokoro-82M inference library. kokoro-js-jp uses this model family. | Upstream code and model weights must be checked separately; the repository README describes Apache-licensed weights. | Not by itself a Japanese browser adapter. The Japanese G2P/assets and mobile runtime remain separate concerns. Considered through kokoro-js-jp rather than a second integration. |

No source code from these projects is copied into OuchiColon. There are no new runtime dependencies or model downloads in the default path. Current update/issue activity beyond the resolved refs is UNKNOWN; this environment's GitHub API returned HTTP 403, so no issue/PR count or exact last-update date is claimed.

## Decision and hypothesis

- **Adopted now:** system `speechSynthesis.getVoices()` selection, per-utterance voice/rate/pitch/volume, in-memory response timing, short-answer/repair handling, and interim-only visual `HEARING` reaction.
- **Held for device trial:** kokoro-js-jp is the best experimental browser candidate on paper. Its ~24 MB dictionary archive, ~107 MB expanded dictionary, model download of tens of MB or more, dependency tree, and unknown iPhone memory/latency make it inappropriate as a default and too risky to load automatically. No model is fetched by this build. A separate opt-in experiment can follow only after iPhone memory/cold-start testing and model/voice terms review.
- **Not adopted:** VOICEVOX CORE and Style-Bert-VITS2 need a non-Safari execution bridge or substantially different runtime; sherpa-onnx and browser VAD add heavy overlapping work before their iPhone 11 value is measured.

Combination hypothesis: VAD start callback → existing ReactionEngine visual state (without waiting for ASR) → Safari Web Speech final transcript → existing rule conversation → current system TTS. The first transition could beat transcript arrival, while final text remains the only input to conversation. This patch uses the browser's existing speech-start/interim events and does not add another microphone listener; direct VAD comparison remains future work.

## Voice selector and measurement

The debug-only selector lists voices currently exposed by the device and auditions all selected options with `こんにちは！コロンだよ！きょうはなにしてあそぶ？`. Profiles are tentative: gentle (0.88/1.08/1.0), energetic (0.96/1.22/1.0), calm (0.82/0.98/0.92). These are just `rate/pitch/volume`; they do not synthesize a new character timbre. Settings are held in memory and default behavior remains the existing 0.88/1.08 and automatic Japanese voice. Missing/stale voice IDs fall back to the available Japanese voice or the browser's `ja-JP` system default.

Latency samples are bounded to 200 values per metric and only held in memory. The panel reports count, median, and p95 for speech event-to-next rendered frame, speech-end-to-final result, final-to-rule reply, TTS request-to-`onstart`, speech-end-to-`onstart`, and TTS-end-to-recognition restart request. The “20-turn” counter counts TTS `onend` callbacks, not verified audible turns. Do not treat it as a device pass until a caregiver completes 20 continuous iPhone turns and checks sound, double replies, and recognition restart.

No real voice-quality rating, p95, model benchmark, iPhone heat/memory result, or response-time comparison against Phase 3B.2 is available from this workspace. Such measurements are UNKNOWN pending the target device.

## Sources

- https://github.com/VOICEVOX/voicevox_core (README, LICENSE)
- https://github.com/nerosui/kokoro-js-jp (README, package.json, LICENSE)
- https://github.com/hexgrad/kokoro (README, LICENSE)
- https://huggingface.co/hexgrad/Kokoro-82M (model card/license; must be reviewed separately before model redistribution)
- https://github.com/litagin02/Style-Bert-VITS2 (README, LICENSE)
- https://github.com/k2-fsa/sherpa-onnx (README, LICENSE)
- https://github.com/ricky0123/vad (README, LICENSE)
