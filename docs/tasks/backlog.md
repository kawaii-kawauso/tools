# Todo

## 進行中

### Twitchコメント読み上げ拡張
- [x] #1 Twitchの配信ページでコメントを読み上げるChrome拡張を作る → [twitch-chat-reader/README.md](../../twitch-chat-reader/README.md)
- [ ] #2 実際の配信で、読み上げとゲーム・配信ソフトへの負荷を確かめる（人の確認が前提） → [twitch-chat-reader/README.md](../../twitch-chat-reader/README.md)
- [ ] #3 偽のチャットサーバーを使う自動テストを入れる（テスト用のws依存を追加する前に要確認） → [twitch-chat-reader/docs/logic.md](../../twitch-chat-reader/docs/logic.md)
- [x] #4 ショートカットキーで読み上げの停止とON/OFFを切り替え、OFFにしたときやチャンネルを移ったときは待ち行列も止める → [twitch-chat-reader/background.js](../../twitch-chat-reader/background.js)
- [x] #5 読み上げ前の整形を足す（NGワード、同じ人の連投の制限、wwwなどの繰り返しの圧縮、/meの制御文字と<>の除去、先頭の@名前、表示名での除外） → [twitch-chat-reader/content.js](../../twitch-chat-reader/content.js)
- [x] #6 設定画面の保存を変更確定時だけにし、数値を範囲内に丸める（同期ストレージの書き込み上限で設定が消えるため） → [twitch-chat-reader/popup.js](../../twitch-chat-reader/popup.js)
- [x] #7 混んだときは古い待ちを捨てて最新を読み、待ち件数の数え方を停止・例外・worker停止でもずれない形にする → [twitch-chat-reader/background.js](../../twitch-chat-reader/background.js)
- [x] #8 配信者本人を読まない設定と、読むチャンネルの許可リストを足し、チャンネル名の判定を厳しくする → [twitch-chat-reader/content.js](../../twitch-chat-reader/content.js)
- [x] #9 1件の例外で後続が落ちない、拡張の更新後に読み直す、無通信を検知して張り直す、などの堅牢化 → [twitch-chat-reader/content.js](../../twitch-chat-reader/content.js)
- [ ] #10 OBSで読み上げを配信に乗せる・乗せない設定手順をREADMEに書く（実機での確認が前提） → [twitch-chat-reader/README.md](../../twitch-chat-reader/README.md)
- [ ] #11 実際のTwitchとPCで確かめる：ゲーム操作中にショートカットが効くか、/meでエモートを含むコメントの消し方、配信者ダッシュボードでの接続（人の確認が前提） → [twitch-chat-reader/README.md](../../twitch-chat-reader/README.md)
