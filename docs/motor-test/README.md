# Colon AtomS3 Motor Test v1.0

独立した検証用画面です。会話・表情・音声認識とは別のエントリで起動し、会話からの自動走行は実装していません。実機への書き込み、USBシリアル接続、モーター通電は今回実施していません。

## 使い方（モック）

プロジェクトで `npm run dev -- --host 127.0.0.1 --port 5174` を実行し、`http://127.0.0.1:5174/ouchi-colon/motor-test.html` を開きます。既存会話画面のクイック操作にもリンクがあります。

1. 接続先が「モック」であることを確認し、「接続する」。
2. Phase 2で、仮想試験の確認欄（配線・物理遮断・浮かせた状態・VM OFF）をチェック。
3. 速度・周波数・最大パルスを設定。「確認して制御を許可」。
4. 個別モーター／十字キーを押す。指を離すか、初期100msで停止・許可解除。
5. 緊急停止、解除、再接続を確認。再接続・緊急停止解除だけでは駆動できません。
6. 電源診断を手入力し、JSON／CSVを保存。

モックは実機と接続せず、PWM値も仮想です。ブラウザーのタイマーはバックグラウンドで遅れるため、実機の停止時間を証明する試験には使えません。

## リポジトリ調査結果

調査時点の実体は `OuchiColon-Windows-3E`。Vite／TypeScript／Canvas PWAで、AtomS3ファームウェア、GPIO定義、BLE GATT、HTTP／WebSocketロボット制御、notifプロトコルは見つかりませんでした。存在を確認できない通信を再利用したとは扱っていません。既存の会話・顔・音声モジュールは今回変更していません。

実機接続には新たにAtomS3のWi-Fi SoftAP＋同一オリジンHTTPを使用します。iPhone Safariでブラウザーから試せる構成とし、Web Bluetoothへの依存は追加しません。GitHub PagesのHTTPS画面から本体のHTTPへ接続する構成も採用しません。

モックは通常Web配信、実機はAtomS3自身が**同じMotor Test画面だけ**を配信します。会話辞書・音声・顔・MediaPipeをAtomS3には載せません。APはインターネットへの経路を提供しないので、テスト中のオンライン音声認識との同時運用は対象外です。接続は1台・制御セッション1個です。

## ビルドとテスト

```powershell
npm run typecheck
npm test
npm run test:motor-native
npm run build
npm run motor:package
npm run motor:firmware:build
git diff --check
```

- Web: Node.js 24、既存のnpm依存を使用。新しいWeb実行時依存はありません。
- Native: C++17コンパイラ。`CXX`で指定できます。Windowsでは既存MSYS2のg++も検出します。
- Firmware: Arduino CLI、`esp32:esp32` **3.3.4**、`ArduinoJson` **7.4.2**、FQBN `esp32:esp32:m5stack_atoms3`で検証。
- `ARDUINO_CLI`でCLIパスを指定可能。ビルドスクリプトにupload処理はありません。
- `motor:package`はMotor Testの依存グラフだけをgzipして `firmware/ColonAtomS3MotorTest/generated/` に生成します。
- コンパイル成果物と生ログは `.motor-build/`。生成物はGit対象外ですがローカルに保存しています。
- `firmware/ColonAtomS3MotorTest/ColonAtomS3MotorTest.ino` がスケッチです。

## 実機の許可ゲート

初期ビルドは `COLON_ENABLE_OUTPUTS=0`、`COLON_POWER_QUALIFIED=0`。GPIOは停止状態へ初期化しますが、画面からARMしてもPWM駆動を許可しません。

信号試験へ進むには、ユーザーがVM OFF・モーター未接続・配線を確認し、書き込みを承認した後に、別ビルドで `COLON_ENABLE_OUTPUTS=1` を設定します。Phase 3／4でのみ信号を許可し、画面での確認も必要です。

Phase 5以降はさらに `COLON_POWER_QUALIFIED=1` が必要です。これはUIから変更できません。**現状では電源・電流の適合を確認できていないため、この設定を有効にする条件は満たしていません。** 単に動かすための解除はしないでください。

設定変更用のコンパイル例（今回実行していません）:

```powershell
# VM OFF・モーター未接続の信号試験専用。書き込みは含みません。
arduino-cli compile --fqbn esp32:esp32:m5stack_atoms3 --build-property 'compiler.cpp.extra_flags=-DCOLON_ENABLE_OUTPUTS=1' firmware/ColonAtomS3MotorTest
```

本体起動後、USBシリアル115200bpsに、その起動だけのWi-Fi名・パスワード・URLが出ます。接続先は `http://192.168.4.1/`。APパスワードと制御トークンは診断ログに含めません。

リポジトリに既存ファームウェアがなくても、**実際のAtomS3に現在入っているプログラムは未確認**です。書き込みはそのプログラムを置き換えるため、バックアップ・復元方法の確認後にユーザーが判断してください。

## 停止方式と限界

| 条件 | 動作 |
|---|---|
| 起動／GPIO初期化失敗 | ARM禁止、左右0 |
| 指を離す／pointer cancel／capture loss／画面非表示／pagehide | STOP要求。非表示では接続も解除 |
| 操作更新なし220ms | 本体が停止・ARM解除 |
| ハートビートなし1000ms | 本体が接続解除・停止 |
| 最大パルス | 初期100ms、設定50〜500ms。HOLDで延長不可 |
| 正逆切替 | 両入力LOWの停止を挟み、必要なら100ms待ってソフトスタート |
| 緊急停止 | ラッチ。RESETしてもARMは戻らない |
| 遅れて届いた旧コマンド | 接続トークン・単調増加seq・press IDで拒否 |
| 再接続／再起動検出 | 自動再始動しない |

本体はHTTPループとは別のESP timerタスクで10ms周期に判定します。上記は設計値であり、実機でのGPIO低下時間・Wi-Fi切断時挙動は未測定です。CPU／電源／出力段の故障までソフトだけで保証はできません。停止はIN1=IN2=LOWの**空転**で、車体がその場で静止する保証はありません。物理的なモーター電源遮断を用意してください。

診断記録はメモリ内最大500件。設定値、手入力した実測値、本体応答、モックを区別し、未設置センサーの値はnull／未測定とします。表示消灯からUSB停止を推定しません。

- [GPIO・電源リスク](wiring-and-risks.md)
- [実機試験の順番](hardware-test-procedure.md)
- [検証結果](validation.md)
