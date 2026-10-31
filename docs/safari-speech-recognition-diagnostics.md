# Safari speech-recognition diagnostics

The one-shot Japanese Web Speech recognizer now requests up to three alternatives. The debug panel shows the final selected transcript and the alternatives with confidence values when Safari provides them. These values are transient in the page and are not written to storage or sent to the conversation engine.

To measure greeting recognition on iPhone Safari, open `?debug=1`, enable the parent consent and microphone, then say each phrase five times in a quiet room: 「おはよう」「こんにちは」「こんばんは」. For every turn, record the expected phrase, final transcript, alternatives, and whether Colon's reply matches. Keep the phone and speaking distance fixed. Repeat once with the camera off if the camera is normally used at the same time.

Interpretation:

- If the final transcript is wrong, compare the alternatives. If the intended phrase appears among them, a narrowly scoped candidate-selection rule can be evaluated against the samples.
- If the final transcript is right but the reply is wrong, fix intent classification or greeting response logic instead of changing speech recognition.
- If Safari returns only one alternative or no confidence, use the final transcript as the measurement and do not assume a confidence value.

`maxAlternatives` is only a request to the browser recognizer. Safari may return fewer alternatives. Recognition quality and confidence values must be checked on the target iPhone/iOS/Safari combination.

Privacy: use an adult tester for this check. Do not retain children's raw speech, transcripts, or alternatives in notes. For child testing, record only aggregate counts (for example, correct/incorrect per phrase) and erase the transient debug display after each session.
