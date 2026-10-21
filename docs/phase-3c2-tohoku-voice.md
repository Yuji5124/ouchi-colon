# Phase 3C.2 — TOHOKU VOICE / Open JTalk browser experiment

Checked 2026-10-22. The code and asset measurements below are from this build and a Chromium desktop smoke run. iPhone 11 Safari, audible output, memory, heat, offline, and long-session measurements remain UNKNOWN.

This document supersedes the Phase 3C.1 recommendation to wait for a licensed Tohoku model: Phase 3C.2 located the actual upstream models and added a lazy-loaded, isolated browser Worker experiment. The normal conversation path still uses the existing iOS SpeechSynthesis engine.

## Source and exact models

`https://github.com/icn-lab/htsvoice-tohoku-f01` was checked at `master` commit `8e3306021db135c265f5eda5f062dc489707ddf8` (2015-12-21). This is the upstream repository named here, not an assumption based on MIKARO's local filename. It contains these real files:

| Model file | Size | SHA-256 | Source status |
|---|---:|---|---|
| `tohoku-f01-neutral.htsvoice` | 2,154,716 bytes | `ded6acb4243b93cc50896199d67b00a7c487662bfcdcd3f9f30a4fb0444b0b46` | Exists upstream; deferred in this release |
| `tohoku-f01-happy.htsvoice` | 1,636,831 bytes | `6bf9559a0757c5250165de40dda034a7e95504f3a3ce4abce58532cee1040cc0` | Exists upstream; bundled and selectable in the lab |
| `tohoku-f01-sad.htsvoice` | 2,005,039 bytes | `1c76d4d5646c46e13410651c4232b95af8b878e67afd370a605b5de792ba17ee` | Exists upstream; deferred in this release |
| `tohoku-f01-angry.htsvoice` | 1,830,649 bytes | `c246afac0d41ada4010db80ca673b6b51cb8e16e9f3a47487d0df3d2ca5b7ec8` | Exists upstream; deferred in this release |

The upstream `README.md` identifies a Japanese female voice with the four emotions and credits Intelligent Communication Network (Ito-Nose) Laboratory, Tohoku University. `COPYRIGHT.txt` states CC BY 4.0. The bundled Happy model is byte-identical to the upstream file (SHA-256 above); it is unmodified and is attributed in the debug lab. Model terms are separate from the code, dictionary, and engine licenses.

MIKARO HEAD `f750fdf6ac56759f5df8371926d518477d75ec54` (2026-04-30) records the same Happy filename, but does not commit the operator-supplied model. Its exact local asset's hash cannot be compared. The OuchiColon file is taken from the verified Tohoku upstream, so its redistribution notice and source are known; identity with MIKARO's absent local file remains UNKNOWN.

## Browser synthesis implementation

The lab's worker is created only after the user presses **Happyモデルを読み込む** while the debug panel is open. It then downloads the generated ES module/WASM, compressed dictionary, and the single Happy model. Worker code expands the gzip tar stream into Emscripten's in-memory FS in chunks, loads the dictionary and model once, and keeps the engine alive for later text. Each synthesis uses the current text and returns a WAV buffer to the page. The page keeps that WAV only in memory and requires a separate **生成音声を再生** action to respect Safari's user-activation policy. The debug lab does not connect Open JTalk to conversation, recognition, reactions, expression, or mouth animation. Existing iOS TTS remains the normal engine and is available from the lab as a separate comparison.

| Asset | Measurement | Load behavior |
|---|---:|---|
| `open_jtalk.mjs` | 66 KB | Loaded only when the lab first starts |
| `open_jtalk.wasm` | 416 KB | Loaded only when the lab first starts |
| UTF-8 NAIST dictionary gzip tar | 23,644,688 bytes (22.55 MiB) | Downloaded only on explicit initialization |
| Dictionary expanded file payload | 107,304,813 bytes (102.33 MiB) | Streamed into Worker FS; excludes WASM heap and buffers |
| Happy HTS voice | 1,636,831 bytes (1.56 MiB) | Downloaded only on explicit initialization |

The build used Emscripten SDK Docker image `emscripten/emsdk:3.1.64`, Open JTalk `r9y9/open_jtalk` commit `462fc38e7520aa89e4d32b2611749208528c901e`, HTS Engine API commit `214e26dfb7f728ff9db39c14a59db709abcc121d`, and the upstream `hrhr49/wasm_open_jtalk` build approach at `a5bb4c541f566f8e5470003ba26bd0ce92e28da3`. The published `wasm_open_jtalk@0.0.1` itself is Node.js-only (`nodefs.js`, `NODERAWFS=1`); it was **not** treated as browser-ready. Instead, the Emscripten libraries were rebuilt without NodeFS, with `ENVIRONMENT=worker`, ES module output, memory growth, and a small C wrapper around Open JTalk's existing initialization/synthesis functions. That wrapper keeps the dictionary/model loaded across generated text. The generated `.mjs`/`.wasm` is an actual browser build; iOS Safari compatibility remains unverified.

### Separate license obligations

- **Tohoku model:** CC BY 4.0. Attribution, a link to the license, and identification that the model is unmodified are shown in the lab; the source `COPYRIGHT.txt` is bundled.
- **Open JTalk:** Modified BSD notices in `public/openjtalk/licenses/OPEN-JTALK-COPYING.txt`.
- **MeCab implementation and UTF-8 dictionary:** distinct BSD-style notices, including NAIST and UniDic Consortium terms, in `MECAB-COPYING.txt` and `DICTIONARY-COPYING.txt`.
- **HTS Engine API:** separate BSD-style notice in `HTS-ENGINE-COPYING.txt`.
- **Generated Emscripten runtime:** generated from Emscripten 3.1.64 and linked code; upstream source notices above are kept with the distributed files. Build toolchain container is not included.
- **`hrhr49/wasm_open_jtalk`:** ISC in package metadata, with upstream source notices in its repository; its Node CLI output is not redistributed as the browser output.

## Local browser result

Chromium desktop, local Vite server, user-triggered lab load:

- All worker runtime, WASM, dictionary, and model requests returned HTTP 200.
- WASM initialization (including dictionary expansion and loading): 9,770 ms on the first run; 5,401–5,622 ms on two later local runs.
- Dynamic short Japanese sample generation: 4,258 ms on the first run; 670–769 ms on two later local runs. These are separate desktop observations, not a controlled benchmark.
- Produced WAV buffer: 418 KB.
- Browser accepted the generated WAV; HTML audio `playing` event fired 257 ms after the Play action on one later run. The p95 UI is session-local; the successful session had only one sample, so its median and p95 both equal that one observation.
- Whether a person can hear the output: UNKNOWN in headless Chromium. iPhone 11 playback: UNKNOWN.
- UI remained in a separate debug-only panel; no conversation, recognition, camera, reaction, image, or regular TTS code path was modified to use this engine.
- Worker memory, Safari memory ceiling, face animation cadence during generation, heat, 20-turn stability, and offline reload: UNKNOWN.

The production `vite preview` build was also exercised from the `/ouchi-colon/` base path: initialization 7,094 ms, generation 834 ms, WAV 418 KB, and the browser `playing` event 83 ms after the button action. That run had one sample per metric, so median/p95 are provisional `n=1` values; generated audio was not physically auditioned.

The demo worker reports generation time, initialization time, WAV size, and playback-start event when available. Browsers do not expose a reliable per-worker heap measurement here, so memory remains UNKNOWN. The normal app does not fetch these assets on initial load. The existing Service Worker can cache same-origin GET requests when the experiment fetches them; offline replay is not yet confirmed.

## Phase gates and status

- **Phase A — investigation and license checks:** complete for the four Tohoku models, Open JTalk/HTS build sources, and the bundled dictionary notices. The direct browser build is now generated; no iPhone claim is made.
- **Phase B — one Happy generation:** desktop Chromium synthesis produced dynamic Japanese WAV successfully. This is not the requested iPhone 11 gate, and no other voice was added.
- **Phase C — Neutral/Sad/Angry selector:** deferred until Happy generation and playback are confirmed on iPhone 11.
- **Phase D — speed comparison:** partial desktop observations only; iOS TTS timing was not remeasured. Do not use the current 9.77s/4.26s sample as an iPhone estimate.

To repeat the device check, open `?debug=1`, stop camera and recognition to reduce contention, open **TOHOKU VOICE LAB**, explicitly load Happy, generate a sample, then press the separate playback button. Check audible output, face animation cadence, return to debug controls, repeat the same text, try free input, stop/reload, and compare with the separate existing iOS TTS button. Report any Safari error text from the lab. Do not enable this engine for conversation until device latency, playback and 20-turn stability are measured.

## Sources

- https://github.com/icn-lab/htsvoice-tohoku-f01 (model files, README, COPYRIGHT.txt, commit above)
- https://github.com/Yuji5124/MIKARO (operator integration reference; exact `.htsvoice` is absent from tracked files)
- https://github.com/r9y9/open_jtalk/tree/1.11 (Open JTalk source and Modified BSD notice)
- https://github.com/r9y9/hts_engine_API (HTS Engine API source and separate notice)
- https://github.com/hrhr49/wasm_open_jtalk (Node-only build reference; not the browser artifact)
- https://github.com/KoharuYuzuki/openjtalk-wasm (Node/macOS-oriented alternative, MIT; no Safari evidence found)
- https://github.com/nerosui/kokoro-js-jp (browser Open JTalk WASM used for G2P, not HTS synthesis)
- https://creativecommons.org/licenses/by/4.0/
