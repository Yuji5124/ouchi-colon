# Colon iPhone 11直接連携 v33

2026-11-09。iPhoneのSafariとAtomS3を同じ家庭内LANに接続する。PCは初回の設定・ビルド・USB書き込みで使用し、運用中の中継サーバーは不要。

```text
iPhone Safari: HTTPSのColonアプリ（会話・TOHOKU音声・顔・ラジコン）
       ↓ HTTPS + 接続コード・一時セッション
AtomS3: https://colon-atom.local （家庭内Wi-Fi）
       ├ LCDの簡易表情
       └ 既存MotorSafetyによる左右モーター制御
```

## 今回の実装

- `?phone=1` でTOHOKUの会話設定と小型の「設定」「会話開始／停止」「接続・操作」を表示。詳細は折り畳み、横向きでは顔とパネルの領域を分ける。接続中の非常停止は常時表示。
- 動作先「iPhone → AtomS3 直接Wi-Fi」を追加。Web BluetoothやPCのNotif中継を使用しない。
- HTTPS・CORSの許可元固定・12文字以上の接続コード・一時セッション・接続試行制限。認証や証明書検証の無効化、HTTPへの自動切替は実装しない。
- 1台のAtomS3にLCD表示とモーター制御をまとめる。LCDは簡易表情を返答の終了後に更新し、発話本文を送信しない。元のNotifの任意文字・画像編集はPC向け機能として別に残す。
- 従来のモーター安全処理を共有。初期出力OFF、駆動の手動許可、1回100〜500ms、指を離す／画面を離れる／通信断で停止。再接続時は自動で駆動しない。

## 1. 初回PC設定

対象はAtomS3 C123。検証に使用する開発環境はESP32 Arduino core 3.3.4、ArduinoJson 7.4.2、M5GFX 0.2.9。AtomS3R/Liteへの互換性は未確認。

作業フォルダ:
`C:\Users\hp\Documents\ChatGPT\Ouchi Colon\Colon-Integrated-v32`

```powershell
npm run phone:prepare
```

`.phone-private/settings.json` が作られる。`ssid` と `password` に家庭内Wi-Fiの情報をPC上で入力する。AtomS3は2.4GHz対応の接続先を使用する。iPhoneは同じLANにつながっていればよい。

`appOrigin` の初期値は `https://yuji5124.github.io`。アプリを別のHTTPSサイトで配信する場合だけ、そのオリジン（パスなし）に変更する。接続コード `pairCode` は生成済み。SSID・パスワード・接続コードをチャットやGitHubへ送らない。

もう一度実行:

```powershell
npm run phone:prepare
npm run phone:firmware:build
```

OpenSSLは既存Git for Windowsの同梱実行ファイルを使用する。証明書・秘密鍵は既存のものを自動上書きしない。出力ファームウェアは `.phone-build/firmware/` に生成される。**このビルドはモーター出力を無効にした診断用で、書き込みを実行しない。**

8MBフラッシュ用 `default_8MB` パーティションを使用するため、従来プログラムからの移行時はパーティション変更と既存データへの影響を確認する。現在の実機プログラムのバックアップ・復旧方法を確認してからUSBで書き込む。書き込みは利用者の承認を得て別途実施する。

## 2. iPhoneの証明書設定

`.phone-private/Install-on-iPhone.cer` **だけ**を自分のiPhoneへ渡す。秘密鍵 `.key`、設定JSON、秘密情報を含む `.phone-build` やbinファイルは配信・アップロードしない。

証明書のインストール・信頼設定は利用者自身が行う。Appleの案内:
https://support.apple.com/ja-jp/102390

インストール後、「設定 → 一般 → 情報 → 証明書信頼設定」で自分の `Colon Local Device Root` を確認して信頼を有効にする。これはローカルCAを追加する操作なので、内容を確認してから行う。

このCAで署名したサーバー証明書の対象は `colon-atom.local`。IPアドレスへのアクセスは、証明書にそのIPのSANが含まれていない限り使用しない。警告画面を無理に進めず、名前解決・証明書・端末時刻を確認する。

## 3. アプリ公開と実機起動

このコードはまだGitHub Pagesへ公開していない。既存公開URLのv31を開いても直接接続の設定は出ない。レビュー・コミット・公開が必要。

公開後に使用する入口は `/ouchi-colon/phone.html` または `/ouchi-colon/?phone=1`。端末ではHTTPSのアプリを開く。HTTPのPCアドレスでは音声機能を確認できない。

AtomS3へ書き込み済みの場合:

1. モーター電源を切った状態でAtomS3へUSB給電し、家庭内Wi-Fiへの接続を待つ。
2. LCDの `Colon HTTPS ready` を確認する。SSID・Wi-Fiパスワードは画面やシリアルへ出さない。接続コードはLCDおよびPCの設定JSONで確認できる。
3. iPhoneのSafariで `https://colon-atom.local/` を開く。`Colon AtomS3 HTTPS ready` が表示されればTLS・名前解決が成立している。
4. HTTPS配信したColonアプリを `?phone=1` で開く。
5. 「設定」でTOHOKU準備 → 音声有効化 → 保護者確認を行う。「顔を見る」で閉じ、「会話開始」を押す。初回はSafariのマイク許可が必要。
6. 「接続・操作」で直接Wi-Fiを選び、`https://colon-atom.local` と設定した接続コードを入力し接続する。コードはページ内だけで保持し、ブラウザーへ永続保存しない。
7. 任意で「返答後にATOMにも表情を表示」をON。簡易表情の更新にモーター駆動許可は不要。
8. 診断用FWでは駆動は許可できない。実測電圧・電流・配線等の確認後に、出力を有効にする別ビルドをレビューする。チェック欄だけでこの制限を解除することはできない。

## 確認できている範囲

- 直接接続のHTTPS URL制限、ペアリングとトークン分離、遅延応答、途中キャンセル、停止、エラー説明を自動テスト。
- 全251テスト成功。ネイティブ安全テスト6,096項目・1,000パラメーターケース成功。
- 型チェックとWeb本番ビルド成功。実画面の確認ツールはタイムアウトのため、iPhone 11でのレイアウト・音声・証明書・LAN通信は未検証。
- ESP32 Arduino core 3.3.4の実機用コンパイル成功。Flash 1,101,979 / 3,342,336 bytes（32%）、静的RAM 47,100 / 327,680 bytes（14%）。TLS接続時の動的RAM使用量・停止遅延は実測していない。
- 仮設定で検証した成果物は `.phone-build/test-firmware/` に隔離しており、実運用への書き込みには使用しない。実運用用は利用者のWi-Fi設定を検証した後に `.phone-build/firmware/` へ別途生成する。開発環境のTinyUSB由来の警告は残るが、ビルドエラーはない。
- ビルドログは `phone-build-check.log`。コンパイル成功と実機動作を区別する。
- AtomS3への書き込み、iPhoneへの証明書インストール、モーター通電、アプリの公開は今回実施していない。

## 技術資料

- ESP HTTPS Server: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/protocols/esp_https_server.html
- M5Stack AtomS3: https://docs.m5stack.com/en/core/AtomS3
- Apple証明書信頼設定: https://support.apple.com/ja-jp/102390
- WebKitの安全なオリジンに関する説明: https://bugs.webkit.org/show_bug.cgi?id=252303
