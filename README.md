# OuchiColon

OuchiColon の iPhone 11 向け顔アニメーションを作る Vite + TypeScript + Canvas 2D の PWA です。画面は顔だけを表示し、Canvas 上に背景・頬・目・口を別レイヤーとして描きます。通常時に操作 UI は表示しません。

## 開発

Node.js 24 と npm を使います。

```sh
npm ci
npm run dev
```

Vite が表示する URL をブラウザーで開きます。デバッグ画面は URL に `?debug=1` を付けるか、`D` キーで表示できます。キー `1`〜`8` で表情、左右矢印で視線を操作し、パネル内の「まばたき」「おしゃべり」ボタンや口パクスライダーで動作を確認できます。FPS表示は1秒後から更新されます。

Phase 2 の顔追跡は同パネルの「カメラで顔追跡を開始」を押すと起動し、ブラウザーが前面カメラの許可を求めます。初回は約15 MBのMediaPipe実行環境とモデルを取得します。映像は端末内で処理し、保存・送信しません。停止・画面離脱・バックグラウンド移行でカメラを停止します。実機計測は [Phase 2 検証メモ](docs/phase-2-face-tracking.md) を参照してください。

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

## GitHub Pages

リポジトリ設定の **Pages** で **GitHub Actions** を選ぶと、`.github/workflows/pages.yml` がビルドして公開します。公開 URL は `https://<owner>.github.io/ouchi-colon/` です。PWA シェルは初回アクセス後にページと取得済み素材をキャッシュします。Phase 2 の検出用リソースは、明示的に顔追跡を開始した後、許可済みの配布元から取得してキャッシュします。

## 実装範囲

- IDLE、HAPPY、TALK、THINK、SURPRISE、SAD、SLEEP、SEARCH の表情
- PNG の開閉目、ハイライト、口、頬、背景。座標とサイズは `DEFAULT_FACE_LAYOUT` で調整可能
- PNG 読み込み失敗時は同じパーツを Canvas で描画
- 不規則なまばたき、補間する視線移動、タップ時の HAPPY、デバッグ用の口パク
- 描画を最大 30fps に制限し、デバッグパネルに実測FPSを表示
- PWA manifest とオフライン用 Service Worker

顔 PNG は添付画像を見ながら再作成した仮素材で、元画像からの切り出しではありません。確定素材へ差し替える場合も同じパスと PNG 寸法を使えます。カメラ顔検出、音声認識・合成、会話、モーター、ネイティブ iOS 機能は未実装です。カメラやマイクへのアクセスも行いません。

## iPhone 11 実機確認

Safari でページを開き、横向きにして表示とタップ操作を確認してください。Web manifest の `orientation: landscape` は設定していますが、iOS Safari が画面回転をロックする保証はありません。実機の Safari / ホーム画面追加モードでの表示、30fps、オフライン再読み込みはこの開発環境では未検証です。
