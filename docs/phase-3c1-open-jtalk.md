# Phase 3C.1 — Open JTalk multi-voice investigation

Checked 2026-10-21. This is a source/package and license review, not a Safari or iPhone 11 execution test. No Open JTalk files or models were added to OuchiColon.

**Historical result:** the model-provenance and implementation status below were updated by [Phase 3C.2](phase-3c2-tohoku-voice.md). The direct upstream Tohoku repository and CC BY 4.0 notice have since been verified, and a separate lazy-loaded browser Worker now produces dynamic WAV in desktop Chromium. The prior UNKNOWN about the source repository's license and the prior “no files added” conclusion applied only to the 3C.1 snapshot. The absent model file committed by MIKARO still means byte identity with its operator-supplied copy is UNKNOWN. iPhone Safari remains unverified.

## Findings

### MIKARO reference

`Yuji5124/MIKARO` HEAD checked at `f750fdf` (2026-04-30). Its current TTS implementation (`head/tts_openjtalk.py`) invokes the native `open_jtalk` process on Raspberry Pi 5, points it at a local dictionary and `.htsvoice`, writes a WAV to `/tmp`, then serves/transfers the file to Raspberry Pi 3 for playback. That is not a browser or iPhone implementation and it does not preserve in-browser immediate audio playback.

MIKARO's journal names `tohoku-f01-happy.htsvoice` as its selected model, but the file is absent from the GitHub checkout (the journal and startup script expect an operator-provided `assets/voices/` file). Its public repository does not establish that model's original source, exact license, redistribution permission, size, or model architecture. Those are **UNKNOWN**. Do not treat the MIKARO code license as permission to redistribute the voice model.

### Browser/WebAssembly ports

| Candidate | What is actually published | Browser suitability |
|---|---|---|
| [hrhr49/wasm_open_jtalk](https://github.com/hrhr49/wasm_open_jtalk) (`main` HEAD `a5bb4c5`, latest commit 2021-02-21) | Emscripten output distributed as npm `wasm_open_jtalk@0.0.1`: tarball 188.4 kB, unpacked 539.6 kB, containing JS 100.0 kB and WASM 421.1 kB. The README says it is a Node.js CLI. The build links `-lnodefs.js` and sets `NODERAWFS=1`; it is not a browser worker build. Its source has no browser worker adapter or browser tests. | Not directly usable in Safari. A separate Emscripten build and browser filesystem/worker integration is needed. The repository's `npm test` is intentionally unimplemented (exits with an error). |
| [KoharuYuzuki/openjtalk-wasm](https://github.com/KoharuYuzuki/openjtalk-wasm) | README says it was tested only on macOS and runs with Node.js. MIT license. | Not a browser adapter; no iOS/Safari claim or benchmark. |
| [kokoro-js-jp](https://github.com/nerosui/kokoro-js-jp) | Browser Open JTalk WASM is used for Japanese grapheme-to-phoneme processing. The acoustic voice generation is Kokoro-82M/ONNX, not Open JTalk's HTS synthesis. It downloads an Open JTalk dictionary for G2P. | It is a real browser example of Open JTalk-derived G2P, but it does not expose Open JTalk HTS voice models and is not a way to select Mei/Tohoku Open JTalk voices. Its prior investigation is in [Phase 3C research](phase-3c-research.md). |

[VOICEVOX CORE](https://github.com/VOICEVOX/voicevox_core) is a separate synthesis core, not Open JTalk HTS voice synthesis. Its README documents C dynamic libraries and Python wheels, not a browser WASM target. Core code is MIT, but the selected VOICEVOX speaker/style model carries separate usage conditions; the code license does not clear those model terms. It is not a drop-in path for the MIKARO `.htsvoice` file or the current Safari app.

No directly usable browser Open JTalk/HTS synthesis implementation was found in these candidates. The available Emscripten output requires a port; calling it “Safari-compatible” based on its `.wasm` suffix would be inaccurate.

## Actual voice models found

The `hrhr49/wasm_open_jtalk` source checkout contains the five actual Mei HTS model files:

| File / selectable label | Model distinction | File size | License/source |
|---|---|---:|---|
| `mei_normal.htsvoice` — Normal | Mei voice, normal style | ~843 KiB | MMDAgent HTS Voice “Mei” v1.4, CC BY 3.0 |
| `mei_happy.htsvoice` — Happy | Mei voice, happy style | ~843 KiB | Same Mei model family and license |
| `mei_angry.htsvoice` — Angry | Mei voice, angry style | ~843 KiB | Same Mei model family and license |
| `mei_sad.htsvoice` — Sad | Mei voice, sad style | ~843 KiB | Same Mei model family and license |
| `mei_bashful.htsvoice` — Bashful | Mei voice, bashful style | ~843 KiB | Same Mei model family and license |

These are five different trained HTS files/styles for the same named Mei character, not five unrelated speakers. Labels such as “cute/high”, “robotic”, or “calm” cannot be promised from these filenames. Pitch, speed and synthesis parameters could produce additional **settings of one model**, but would not be additional models. Subjective quality and child-directed naturalness have not been auditioned here.

The Mei directory's own `README.txt`/`COPYRIGHT.txt` state CC BY 3.0 with attribution and a notice/link to the license. The `tohoku-f01-happy` voice MIKARO uses is a different file and its license remains UNKNOWN; it must not be substituted for Mei or called the same model.

## Dictionary and package size

- The Open JTalk dictionary checked from the WebAssembly sample repository occupies about 103 MB expanded (`sys.dic` alone is about 99 MB).
- A local gzip tar made from that exact checked-out dictionary was about 23 MB. This is a measured packaging size for that checkout, not a promise about a future CDN response.
- Each Mei `.htsvoice` file is about 843 KiB; all five together are about 4.2 MiB. A selector could lazy-load one model, but the dictionary is shared and still required.
- The published Node WebAssembly JS/WASM package is about 188 kB compressed / 540 kB unpacked. This does not include the dictionary or any voice models.
- A browser package would therefore need at least roughly 24 MB transferred for the dictionary plus one model and the runtime bundle (before HTTP details), and roughly 104 MB or more of model/dictionary data after expansion, excluding WASM working memory and synthesis buffers. Exact iPhone resident memory is **UNKNOWN**.

## License obligations by component

Do not infer all-in-one licensing from npm's `license` field:

- `wasm_open_jtalk`'s `package.json` says ISC, while its checked-in top-level LICENSE contains the wrapper MIT text and notices/licenses for bundled upstream components. The npm artifact is a Node command-line package, not a browser-ready binary.
- Open JTalk 1.11 source states Modified BSD. The source distribution also directs users to separate MeCab and `mecab-naist-jdic` COPYING files.
- The dictionary's COPYING includes separate BSD-style notices from NAIST and the UniDic Consortium. Preserve both notices and attribution restrictions on redistribution.
- HTS Engine API has its own BSD-style conditions in the combined license.
- Mei HTS models use CC BY 3.0 and require attribution and a license notice/link on redistribution.
- MIKARO's `tohoku-f01-happy.htsvoice` exact model and permission: UNKNOWN.

The reviewed notices permit redistribution under their stated conditions, but this project did not vendor any of the assets. A future Pages deployment must ship all relevant notices and verify that the exact selected files are those licensed by them.

## Performance and compatibility

| Measure | Current iOS Safari TTS | Open JTalk WASM candidate |
|---|---|---|
| Existing iPhone 11 continuous conversation | Phase 3B.2 user-reported success; this task did not repeat the device test | Not tested |
| Initialization time | Depends on iOS voice service; this task did not remeasure | UNKNOWN on device; README has no browser init timing |
| Short utterance generation | Native service streams/handles synthesis internally; no new measurement | UNKNOWN on iPhone 11. Node package host timing is not representative and its bundled CLI needs an adapter in this environment |
| Play start / 20 turns | Current path remains untouched | UNKNOWN |
| Memory / heat / interaction load | Not remeasured | UNKNOWN; ~103 MB expanded shared dictionary is a material memory risk, plus WASM heap and audio buffer |
| Offline | Existing native TTS path | No browser build, asset cache plan, or offline test exists in the candidate |

## Decision and concrete next implementation

There are **zero selectable Open JTalk voices in OuchiColon** in this release. The evidence shows five real Mei model files, but the only inspected Emscripten product is NodeFS/Node CLI code and the shared dictionary is large. Adding a disabled “selector” would imply working choices; wiring the Node binary into the app would be false compatibility. The existing iOS TTS selector remains the only working selector, and the current engine/continuous conversation are unchanged.

To implement Open JTalk safely, a separate prototype should:

1. Build a browser-only ES module with a dedicated Web Worker (`MODULARIZE`, `EXPORT_ES6`, browser/worker environment), replace NodeFS with an explicit virtual filesystem, and keep all synthesis off the UI thread.
2. Have a parent explicitly select “Open JTalk experiment” before downloading the dictionary and one licensed model. Display measured transfer/storage estimates and keep the current iOS TTS route as a visible fallback.
3. Ship one Mei voice initially with its attribution and dictionary notices. Do not include MIKARO's Tohoku model until the actual model file, upstream provenance, and redistribution license are supplied and verified.
4. Measure initialization, generation, first audio, worker memory proxy, 20 consecutive turns, and recognition/TTS interaction on the iPhone 11. Only after the device test passes should a second voice be added or Open JTalk become an optional conversation engine.

This release stops before those runtime changes because the inspected browser artifact does not exist and the target device's memory/latency constraints are unknown. Existing TTS remains the fallback and default.

## Sources

- https://github.com/Yuji5124/MIKARO (HEAD `f750fdf`, `head/tts_openjtalk.py`, `docs/PROJECT_JOURNAL.md`, `scripts/start_head.sh`)
- https://github.com/r9y9/open_jtalk/tree/1.11 (`src/README`, `src/COPYING`; source says Open JTalk 1.11, release 2018-12-25; branch HEAD commit 2025-04-01)
- https://github.com/hrhr49/wasm_open_jtalk (HEAD `a5bb4c5`, README, build script, npm package `wasm_open_jtalk@0.0.1`, dictionary and Mei assets)
- https://github.com/KoharuYuzuki/openjtalk-wasm (README and MIT license)
- https://github.com/VOICEVOX/voicevox_core (source/library reference; native core code license does not grant rights to unrelated speaker models; this task did not find an official browser Open JTalk adapter there)
- https://github.com/nerosui/kokoro-js-jp (Open JTalk G2P/WASM use, not HTS acoustic synthesis)
- Mei model license URL: https://creativecommons.org/licenses/by/3.0/
