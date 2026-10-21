# Phase 3C.4 — TOHOKU Happy conversation trial

## Scope and safety

TOHOKU Happy is an opt-in conversation voice. iOS SpeechSynthesis remains the initial and recovery voice. The model is fetched only after the explicit **Happyモデルを読み込む** action. After loading, a guardian must press **会話用の音声を有効化**; that action resumes Web Audio and dynamically synthesizes and plays a short greeting to verify the path. Only then is TOHOKU Happy selectable as the conversation voice. This selection is in-memory and resets to iOS TTS on page hide, navigation, debug panel close, experiment stop, or a TOHOKU failure.

For a voice turn, Web Speech API recognition is aborted before reply synthesis. The existing rule-based ConversationEngine creates the reply. The warmed Open JTalk Worker generates that reply dynamically; a Web Audio AudioBufferSourceNode plays the returned WAV. Playback start drives TALK/animated mouth state; source `ended` drives mouth stop and the existing one-shot microphone restart. Recognition remains stopped while TOHOKU synthesis or playback is active. TTS generation/playback error switches the mode to iOS TTS for the same reply and requires guardian re-enablement before TOHOKU can be selected again.

The Web Audio context is created and `resume()` is requested directly from the guardian button action. A suspended or unsupported context is shown as an activation error and leaves iOS TTS available. If playback is explicitly stopped, the microphone does not restart automatically; the guardian may restart it.

No audio, video, transcript, or generated WAV is persisted. The Service Worker shell cache is versioned `v15`; it retains the existing safe migration behavior.

## Device validation steps

1. Open `?debug=1`; leave the normal face screen unchanged.
2. Tick the guardian confirmation for online speech recognition and reply audio.
3. In TOHOKU VOICE LAB press **Happyモデルを読み込む** and wait for the worker to report ready.
4. Press **会話用の音声を有効化**. Confirm the greeting is audible on iPhone 11. A browser playback event alone does not prove audibility.
5. Choose **TOHOKU Happy** under **会話の声**. Start microphone conversation explicitly.
6. Complete 20 voice turns. Confirm each reply is audible, TALK/mouth motion lasts for playback, the mic is off during TTS, and recognition restarts once afterward. Check the in-memory turn count and latency summaries.
7. Try a short hand-entered reply, stop playback during a turn, leave the page during a turn, and trigger an Open JTalk generation error if reproducible. Verify that stale audio is never played, iOS TTS fallback works, and manual mic restart remains available after a user stop.
8. Compare iOS TTS and TOHOKU using the same short inputs. Compare **発話終了→音声開始** (total latency) separately from Open JTalk generation-only time.

Keep camera tracking off for the first audio-only run; test combined camera and speech only after audio-only turns are stable.

## Phase 3C.3 device data (user-reported)

The user reported 20/20 successful TOHOKU Happy generations on iPhone 11, generation median 138 ms, p95 162 ms, maximum 171 ms. This is generation duration only, not speech-end-to-audible-start latency. It has not been independently reproduced in this environment.

## Status

- Integration path and opt-in switching are implemented; iOS TTS remains the default.
- Automated state tests do not validate iPhone audio output, microphone behavior, or audible playback.
- iPhone 11 20-turn conversation stability, self-voice re-recognition, total response latency, audible playback after Web Audio activation, and combined camera load remain **UNKNOWN until the physical device run**.
- The user-reported 20/20 isolated generation benchmark does not establish these integrated behaviors.
