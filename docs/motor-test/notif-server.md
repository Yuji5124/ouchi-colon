# Notifローカルサーバー経由でモーター操作（2026-11-09）

現在の起動URLは http://localhost:18180/ouchi-colon/?motor=1&transport=notif です。127.0.0.1とlocalhostはこのPCを指します。18180は元のColon Atomローカルアプリ、18181は開発用Viteです。AtomのIPアドレスではありません。別PC・スマートフォンのlocalhostではこのPCへ接続できません。

構成は「Web画面 → 元のColon AtomローカルHTTPサーバー → モーター用OS BLE拡張 → AtomS3」です。ブラウザのWeb Bluetoothによる機器選択は使いません。ただしPCとAtomの無線部分はBLEです。USBはファーム導入と給電用で、USBシリアルによる走行制御ではありません。

元のNotif v5実行ファイルは画面表示専用で、モーター用UUIDと20byte指令には対応していません。そのため旧バイナリ自体は変更せず、同じNode HTTPホストへlocal-server/notif-extension.mjsとmotor_ble.pyを追加しました。Python/Bleak 2.1.1がWindowsのBLEを操作します。旧バイナリ経由にモーター指令を流しているわけではなく、モーター用のサーバー拡張です。既存の表示APIはそのままです。

## 起動

1. colon-atom-app と ouchi-colon-motor-test の2リポジトリを同じ親フォルダへ置きます。別配置ならCOLON_MOTOR_ROOTにOuchiColonのルートを指定します。
2. OuchiColonのlocal-server/セットアップ.cmdを実行すると、専用Python環境・依存を導入してWebをビルドします。この作業フォルダでは準備済みです。Python 3.12以降、Node.js 22以降を使用します。
3. colon-atom-appの起動.cmdまたはnpm startで元のサーバーを起動します。専用Pythonはwork/notif-motor-venv内。別のPythonを使う場合はCOLON_MOTOR_PYTHONを指定します。
4. 元のアプリの「モーター用1.8.0をサーバー経由で操作する」リンクを開きます。接続先は「Notifローカルサーバー経由」です。18181の開発画面はこのAPIを提供しません。
5. 他の画面の直接BLE接続を切断し、本体を通常起動した状態で「サーバーでAtomを検索」を押し、サーバーの候補から1台を選びます。検索だけ・接続だけではモーターは動きません。
6. 接続表示が「Notifサーバー接続済み」、ファームがcolon-motor-1.8.0となってから操作します。ファームの再書込みは不要です。

サーバー経由でも、既存WASD・番号動作・共通旋回時間・NVS読書きを同じMotorSessionで扱います。本体の350ms心拍断・時間上限・起動停止は変更しません。サーバーは心拍やMOVEを自動生成・自動再送しません。ブラウザが止まると本体のタイマーで停止します。1つの画面だけが接続を所有します。クラッシュ後は5秒以上通信がなければ、次の明示的な検索・接続時に古い接続を閉じます。実機が停止済みでも通信経路の復帰だけで再始動しません。

通信はlocalhost限定、Host/Origin確認と画面セッショントークン、接続ごとのランダムID、20byte指令の型・版・opcode検証を行います。ブラウザから任意URLへ中継できるAPIはありません。GETだけでモーターは操作できません。

## 検証と制限

HTTP統合試験では、実HTTPでトークン・接続所有権・不正指令拒否・350ms心拍切れを確認しました。ChromeではブラウザのBluetooth APIを使わず、HTTP経由で候補選択・接続停止・WASD解放停止・A01完了・NVS読取り・切断を確認しています。OS BLEアダプターは差替えテストで確認し、PythonワーカーのIPCも切断のみの要求で起動確認しました。実機検索・実機接続・モーター通電は行っていません。実際のWindows Bluetoothと機器の通信遅延はユーザーによる確認が必要です。

Python/Bleak拡張の仕様は[公式クライアント資料](https://bleak.readthedocs.io/en/stable/api/client.html)と[公式スキャナー資料](https://bleak.readthedocs.io/en/stable/api/scanner.html)を参照しています。

検証結果：Web321件、元のColon Atomサーバー9件、Python OS接続アダプター2件が成功。既存BLE画面と新しいHTTP画面のChrome試験、TypeScript/Viteビルドも成功しました。本体C++は変更していません。

[Web](reports/notif-web-tests.txt) / [元サーバー](reports/notif-original-tests.txt) / [Python](reports/notif-python-tests.txt) / [HTTP画面](reports/notif-browser-tests.txt) / [既存画面](reports/notif-regression-browser.txt) / [ビルド](reports/notif-build.txt)
