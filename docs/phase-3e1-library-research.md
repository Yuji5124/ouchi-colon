# Phase 3E.1 conversation library research

Checked against the repository pages and source available on 2026-10-22. No third-party code or package was added.

| Project | What it offers | Maintenance and license | Fit for this phase |
| --- | --- | --- | --- |
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) | JavaScript Japanese morphological tokenizer; can split inflected words and particles. | Repository head `71ea8473bd119546977f22c61e4d52da28ac30a6`; latest repository commit observed 2018-11-24. Code is Apache-2.0. Its bundled MeCab IPADIC dictionary has separate NAIST/ICOT notices and conditions in `NOTICE.md`. | Useful if future work needs token boundaries. It does not classify a child's intent or repair speech recognition errors. Browser deployment also needs dictionary assets, so it adds download and maintenance cost without solving the current semantic distinctions. Not adopted. |
| [atilika/kuromoji](https://github.com/atilika/kuromoji) | Java implementation of Japanese morphological analysis. | Apache-2.0 code; dictionary notices/conditions are separate. | Not a browser TypeScript implementation. Not adopted. |
| [Sudachi.rs](https://github.com/WorksApplications/Sudachi.rs) | Rust Japanese tokenizer with configurable segmentation. | Repository head `1c21940d1ca6b045eb211ecc1cdb767326f3783f`; latest commit observed 2026-10-02. Apache-2.0 code; dictionary is separately distributed with its own conditions. | Active, but the repository is Rust/CLI-oriented and no supported Safari WebAssembly integration was documented in the reviewed README. It still provides tokenization rather than child-directed intent/dialogue. Not adopted. |

## Decision

Use a small local TypeScript pattern library with typed categories, intent-specific matching, context fields, and rule IDs. This keeps the existing Safari bundle light and makes the distinctions in scope explicit: e.g. `カレー食べた` (report), `カレー好き` (preference), `カレー食べたい` (wish), `カレー食べた？` (question), `カレー嫌い` (negative preference), and `カレー作ろう` (proposal).

The library is a practical rule system, not Japanese language understanding. Speech recognition errors, unlisted words, and ambiguous utterances can still fall back. Future tokenizer trials should be evaluated against iPhone 11 download size, initialization time, and measured category/intent accuracy before adoption. No child speech, transcript, or conversation history is sent to or stored by the library.
