# Face PNG assets

All parts are PNGs under `public/assets/face/`. The source image was available only as a chat attachment, so these files are provisional redraws based on its visible colors and shapes; they are not crops from the original file. Review them on iPhone 11 before treating them as final artwork.

| Path | Dimensions | Use |
| --- | ---: | --- |
| `backgrounds/cream.png` | 1792 × 828 | Cream full-screen background |
| `eyes/open.png` | 222 × 274 | Dark brown open eye |
| `eyes/closed.png` | 222 × 274 | Closed eye for blink and sleep |
| `eyes/happy.png` | 222 × 274 | Happy closed-eye arc |
| `eyes/highlight.png` | 222 × 274 | Independent white highlight for gaze movement |
| `cheeks/left.png`, `cheeks/right.png` | 308 × 232 | Soft pink cheek layers |
| `mouths/open.png` | 360 × 260 | Red-brown open mouth with pink tongue |
| `mouths/closed.png` | 360 × 260 | Small smile for speech mouth motion |
| `mouths/sad.png`, `mouths/surprise.png` | 360 × 260 | Expression-specific mouth variants |

Layout coordinates live in `DEFAULT_FACE_LAYOUT` in `src/character/face-renderer.ts`; values use the 1792 × 828 design canvas and can be overridden when constructing `FaceRenderer`. The original vector drawing methods remain as the per-part fallback if an image fails to load. No camera, microphone, or remote asset request is used.
