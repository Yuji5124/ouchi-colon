# Phase 3A: reactions, rule conversation, and speech output

## Implemented

- `ReactionEngine` converts face, voice, utterance, reply, and idle events into the existing eight face expressions. `LISTENING` is an internal reaction state rendered with the existing THINK look, so no face asset or expression art changes. Face discovery reactions have a five-second cooldown, speech events take priority over face events, and input wakes SLEEP.
- `RuleBasedConversationEngine` contains 100 short Japanese reply patterns across greeting, daily events, play, animals, food, weather, emotions, surprise, repeat requests, and bedtime. It retains only the current topic and turn number in memory. Safety and personal-information requests receive a parent-seeking response.
- `MockConversationEngine` is available for deterministic app integration. `LocalLLMConversationEngine` is an interface only; no LLM or network conversation service is used.
- `SpeechSynthesisEngine` uses the browser/OS `SpeechSynthesis` API when available, requests `ja-JP`, and emits start, boundary, end, error, stop, and recognition-suppression state. TTS start/end controls TALK and mouth animation.
- Hand-entered conversation and reaction event simulation are only shown under `?debug=1`. The user must check the guardian-confirmation box before a submit action can speak. The checkbox is off by default. The microphone is never started in Phase 3A.

## Privacy and platform limits

- The application does not save audio, video, or the conversation. Only the last topic and turn number are retained in page memory and disappear when the page closes.
- Replies are generated on-device from rules. iOS/Safari may use a network voice for speech synthesis depending on voice settings. The debug screen discloses this before speech is enabled; speech is opt-in and only starts on a submit button action.
- Safari/iPhone speech voice availability and playback behavior have not been verified on a physical device. The runtime feature check and mock-port tests do not establish iPhone compatibility.
- Speech recognition, interim results, microphone permission, prefetch, and response-latency optimization are not implemented in 3A.
- Target values of 300 ms expression response, 1–1.5 seconds until speech, and 30 FPS have not been measured on iPhone 11.

## Next phase

Phase 3B should first test SpeechRecognition/Web Speech support on the target iPhone 11 Safari/iOS version, then add explicit microphone permission, Japanese interim/final results, no automatic restart loop, and hand-input fallback. Keep the microphone disabled during TTS and use `SpeechSynthesisEngine.shouldSuppressRecognition` to prevent self-recognition.
