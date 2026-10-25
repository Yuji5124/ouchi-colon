# Phase 3E.11「統合・実機検証」

## Automated integration

`tests/phase-3e11-integration.test.ts` composes the same conversation-engine order as `src/main.ts` and checks:

- a child explicitly requests a play idea, chooses a bus, and evolves it through space, a dinosaur, and a roof change;
- an ordinary bus report is not mistaken for an invitation to play;
- privacy and safety handling interrupts active play and clears the play state;
- an active story ends gently when the child says goodnight.

Run the complete local checks with `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.

## iPhone 11 Safari checklist

The Codex execution environment does not provide a physical iPhone 11. All device-only results remain **UNKNOWN** until a person performs and records them. Use an HTTPS build that contains the branch under test; the current GitHub Pages deployment does not automatically include an unmerged branch.

Record iPhone model, iOS version, Safari version, orientation, and whether Safari or Home Screen PWA was used. Mark each item PASS, FAIL, or UNKNOWN.

1. Open the application in landscape, rotate both ways, and confirm the face fits within the safe area without debug controls.
2. Check ordinary conversation, a greeting, and a short child-led play sequence: “遊びを見つけたい” → accept → “バス” → add a new idea. Confirm speech recognition and read-aloud start once per turn and do not loop.
3. Check story start, topic change, “おやすみ”, and safety/privacy interruption. Confirm the app returns to listening/idle and does not continue prompting after the child ends.
4. Check the six existing expressions and mouth movement during speech. Confirm rendering remains smooth during 20 consecutive turns.
5. If camera tracking is enabled by a parent, check it while conversation is idle, then stop it and verify the camera indicator turns off. Record heat, dropped frames, permission behavior, and recovery after backgrounding Safari.
6. Load once, then test a reload in Airplane Mode. Record which shell and face assets remain available. Do not treat a cached shell as proof that speech recognition works offline.

Do not record or retain a child's transcript during this manual check. The automated conversation engine tests use in-memory contexts; they do not validate Safari's microphone, speech service, audible output, camera, thermals, or PWA behavior.
