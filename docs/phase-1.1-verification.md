# Phase 1.1 verification record

## Automated and desktop checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | Lockfile install completed with no audit/fund prompts. |
| `npm test` | PASS | 10 tests passed: eight expression variants, blink, mouth blend, gaze highlight, failed-image fallbacks, PNG signatures, FPS sampling, resize/DPR handling, and mocked Service Worker caching/offline responses. |
| `npm run typecheck` | PASS | TypeScript completed without diagnostics. |
| `npm run build` | PASS | Vite production build completed. |
| `git diff --check` | PASS | No whitespace errors. |
| Production asset requests | PASS | Page, manifest, Service Worker, and all 11 PNG assets returned HTTP 200; PNG signatures matched. |
| Mocked Service Worker | PASS (simulation) | Shell pre-cache, online PNG cache, cached PNG response, and cached navigation fallback were exercised with a mocked Cache API. This does not prove a browser's actual offline reload. |
| Browser screenshot / interactive run | UNKNOWN | Chromium could not complete a headless screenshot in this execution sandbox. Canvas drawing logic was exercised with a mocked context. |

## iPhone 11 checks

| Check | Result |
| --- | --- |
| iPhone 11 landscape layout and notch/safe-area fit | UNKNOWN |
| Safari and Home Screen PWA display | UNKNOWN |
| Real device frame rate | UNKNOWN |
| Airplane Mode reload and cached PNG display | UNKNOWN |
| Rotation on the physical device | UNKNOWN |

The checked-in face PNGs are provisional redraws based on the visible reference, not crops of its original image. See `docs/face-assets.md`. Complete the physical checks in `docs/iphone11-test.md` and record their results before starting Phase 2 implementation.
