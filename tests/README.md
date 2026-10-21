# 自動テスト（Playwright）

Claude のサンドボックスで使っているテスト一式。`node tests/<file>.js <リポジトリのパス> <出力先> <desktop|mobile>` で実行。
テスト用画像（land.jpg / port.jpg / f.heic / f.tif など）は `tests/make_images.py` で生成する。

- `verify4.js` … 参考写真・メイン＋サブ2枚・HEIC/TIFF 取り込み・ログイン記憶・右上ログアウト・スマホのカード表示
- `verify5.js` … 保管料の月別計算・入力の正規化と検証・数量編集・入力途中の確認・CSV対策・バックアップ復元/初期化・QR案内リンク・戻るボタン・拡大
- `monkey.js` … ランダム操作（クリック／入力／アップロード／キー／再読み込み／戻る）。`node tests/monkey.js <repo> <desktop|mobile> <回数> <seed>`
  ページエラー・コンソールエラー・「エラー:」トースト・画面上の undefined/NaN・台帳の破損・重複オーバーレイを検出
- `shots.js` … 全画面をライト/ダーク × PC/スマホで撮影（目視確認用）
- `shots_ui.js` … 画面デザイン A / B の全画面撮影（`node tests/shots_ui.js a`）
- 画面デザインを指定して実行: `UI=a node tests/verify5.js …`（std / a / b）
