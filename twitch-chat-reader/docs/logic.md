# ロジック

`content.js` が配信ページのURLからチャンネル名を取り出し、Twitchのチャットに匿名で参加してコメントを受け取る。コメントを1件ずつ整形・除外したうえで `background.js` に送り、`background.js` が自前の待ち行列から1件ずつ `chrome.tts` で読み上げる。

## 接続から読み上げまでの時間順

```mermaid
sequenceDiagram
    participant Page as Twitchページ(URL)
    participant CS as content.js
    participant IRC as Twitchチャット(IRC)
    participant BG as background.js
    participant TTS as chrome.tts

    CS->>CS: 設定をchrome.storageから読み込む
    loop 1秒ごと tick()
        CS->>Page: targetChannel()（URL判定＋読むチャンネルの許可リスト）
        alt チャンネルが変わった
            CS->>BG: {type: "stop"}（前のチャンネルの待ちを消す）
            CS->>IRC: connect(): CAP REQ tags / NICK justinfanXXXXX / JOIN #channel
        else 6分間なにも受信していない
            CS->>IRC: 切断（→3秒後に再接続）
        end
    end
    loop コメントが届くたび
        IRC-->>CS: PRIVMSG（タグ付き）
        CS->>CS: parsePrivmsg → toSpeech（下の分岐図）
        CS->>BG: {type: "speak", text}
        BG->>BG: enqueue(): 待ちに積む（5件を超えたら古いものを捨てる）
        BG->>TTS: speakNext(): 1件だけ speak
        TTS-->>BG: onEvent(end等) → 同じ世代なら speakNext()
    end
    IRC-->>CS: PING
    CS->>IRC: PONG
```

- TwitchはSPAで、チャンネルを移ってもcontent scriptが再実行されないため、URLを1秒ごとに見て接続し直す
- 停止（ショートカット・ボタン・OFF・チャンネル移動）は `generation` を1つ進める。止める前の発話の終了イベントは世代が合わないので無視し、次の発話を始めない
- 拡張を再読み込みすると、古いページからは `sendMessage` が例外になる。そのとき接続とURL監視を止める

## コメント1件を読むか捨てるか

```mermaid
flowchart TD
    A([IRCから1行受信]) --> B{"PINGか"}
    B -- はい --> B1[PONGを返す] --> Z([終了])
    B -- いいえ --> C{"PRIVMSGの形か<br>parsePrivmsg"}
    C -- いいえ --> Z
    C -- はい --> D["/meの包みを外し、エモートを除去<br>stripEmotes（コードポイント単位）"]
    D --> E{"読まないユーザー・配信者本人・<br>「!」コマンド・読まない言葉か"}
    E -- はい --> X([捨てる])
    E -- いいえ --> G["normalize: 制御文字と<>、URL、@名前、<br>絵文字、www、8888、繰り返し"]
    G --> H{"空か・直前と同文か・<br>同じ人が5秒以内か"}
    H -- はい --> X
    H -- いいえ --> I["maxLength で切り詰め、<br>readName なら名前を付ける"]
    I --> L[/"background.jsへ送る"/]
    L --> M{"enabled がONか"}
    M -- いいえ --> X
    M -- はい --> N["待ちに積む<br>5件を超えたら一番古い待ちを捨てる"]
    N --> P([順に読み上げ])
```

- A〜Iが `content.js`、「background.jsへ送る」から下が `background.js`
- 1行の処理で例外が出ても、同じフレームの後続の行は処理を続ける
- エモート位置はTwitchがコードポイント単位で渡すため、UTF-16のindexで消すと絵文字を含む文でずれる
