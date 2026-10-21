# Phase 3C.3 — TOHOKU Happy repeated generation

## Scope

This phase adds a 20-run, sequential synthesis benchmark to the isolated TOHOKU VOICE LAB. It requires the user to load Happy first, then reuses the same Worker, Open JTalk WASM instance, dictionary and voice model for 20 different Japanese prompts. It does not play each generated item automatically, does not connect Open JTalk to the conversation engine, and does not alter the default iOS TTS route. Generated WAV data and timing samples stay in page memory; refreshing the page clears the benchmark.

The existing iOS TTS remains available through **既存iOS TTSで試す** for manual comparison and recovery. A generation failure stops the benchmark at that item without retrying; the input field keeps the failed prompt for comparison through the existing TTS control. The benchmark cancel control stops between generations and retains the initialized Worker. The experiment stop control can terminate an in-progress Worker operation and requires reinitialization.

## Device procedure

1. Open the debug page, stop camera tracking and speech recognition to reduce device load.
2. Expand **TOHOKU VOICE LAB**, press **Happyモデルを読み込む**, and wait for initialization to complete.
3. Press **20回連続生成を計測** once. The benchmark synthesizes 20 distinct short prompts serially. It does not autoplay; only the latest WAV remains available to play.
4. Record the on-screen count, median, nearest-rank p95, maximum, and per-run generation milliseconds. Press **生成音声を再生** to audition the latest generated item. Use the stop control if needed.
5. Compare a sample through **既存iOS TTSで試す**. For total audible latency, time from the manual synthesis request through the playback tap separately; this phase's generation metric excludes the manual user gesture and playback start.
6. Repeat after a page reload only if measuring cold initialization; the 20-run benchmark itself measures warm generations.

Do not treat browser/desktop timings as iPhone measurements. The page cannot measure actual audibility or Safari's process memory, and device heat should be reported by the person running the physical device check.

## Metric interpretation

- Generation time is the existing Open JTalk Worker time from request to WAV generation completion.
- Median is the arithmetic midpoint (average of the two central values for an even sample count).
- p95 uses nearest-rank: `ceil(0.95 × n)` after ascending sort. For 20 samples this is the 19th value.
- Maximum is the slowest completed generation.
- Initial loading and playback-start metrics remain separate in the lab.
- Cancellation is only checked between individual requests. The in-flight WASM synthesis is synchronous inside the Worker; **実験を停止** terminates that Worker if immediate interruption is needed.

## Status

- Implementation supports a 20-prompt warm-generation run and keeps only the most recent generated WAV in the page UI.
- Existing normal conversation TTS remains the default; Phase 3C.4 integration is out of scope.
- iPhone 11 repeated-generation timings, p95, audible playback stability, battery/heat, and memory: **UNKNOWN until measured on device**.
- The user's report that a TOHOKU Happy sample played on iPhone 11 is carried as prior user-reported evidence; it does not establish 20-run stability or performance.
