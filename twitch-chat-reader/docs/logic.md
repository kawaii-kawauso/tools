# ロジック

`content.js` が配信ページのURLからチャンネル名を取り出し、Twitchのチャットに匿名で参加してコメントを受け取る。コメントを1件ずつ整形・除外したうえで `background.js` に送り、`background.js` が待ち行列の上限を確かめてから `chrome.tts` で読み上げる。

## 接続から読み上げまでの時間順

```mermaid
sequenceDiagram
    participant Page as Twitchページ(URL)
    participant CS as content.js
    participant IRC as Twitchチャット(IRC)
    participant BG as background.js
    participant TTS as chrome.tts

    CS->>CS: 設定をchrome.storageから読み込む
    CS->>Page: channelFromPath(location.pathname)
    CS->>IRC: connect(): CAP REQ tags / NICK justinfanXXXXX / JOIN #channel
    loop コメントが届くたび
        IRC-->>CS: PRIVMSG（タグ付き）
        CS->>CS: parsePrivmsg → toSpeech（下の分岐図）
        CS->>BG: sendMessage {type: "speak", text}
        BG->>BG: speak(): 有効か・pending < 5 か
        BG->>TTS: speak(text, enqueue: true)
        TTS-->>BG: onEvent(end等) → pending を1減らす
    end
    IRC-->>CS: PING
    CS->>IRC: PONG
    loop 1秒ごと
        CS->>Page: チャンネル名が変わったか確認
        alt 変わった
            CS->>IRC: 古い接続を閉じて、新しいチャンネルにJOIN
        end
    end
    alt 接続が切れた
        CS->>IRC: 3秒後に同じチャンネルへ再接続
    end
```

- TwitchはSPAで、チャンネルを移ってもcontent scriptが再実行されないため、URLを1秒ごとに見て接続し直す
- 設定の変更は、`content.js` には `storage.onChanged` ですぐ反映される。`background.js` はコメントのたびに設定を読み直す

## コメント1件を読むか捨てるか

```mermaid
flowchart TD
    A([IRCから1行受信]) --> B{"PINGか"}
    B -- はい --> B1[PONGを返す] --> Z([終了])
    B -- いいえ --> C{"PRIVMSGの形か<br>parsePrivmsg"}
    C -- いいえ --> Z
    C -- はい --> D["エモートを除去<br>stripEmotes（コードポイント単位）"]
    D --> E{"読まないユーザーか<br>ignoreUsers"}
    E -- はい --> X([捨てる])
    E -- いいえ --> F{"「!」で始まるか<br>ignoreCommands がONのとき"}
    F -- はい --> X
    F -- いいえ --> G["URL→「URL」、空白をまとめる"]
    G --> H{"本文が空か"}
    H -- はい --> X
    H -- いいえ --> I{"maxLength を超えるか"}
    I -- はい --> I1["切り詰めて「、以下略」"] --> J
    I -- いいえ --> J{"readName がONか"}
    J -- はい --> J1["「名前、本文」"] --> K
    J -- いいえ --> K["本文のみ"]
    K --> L[/"background.jsへ送る"/]
    L --> M{"enabled がONか"}
    M -- いいえ --> X
    M -- はい --> N{"pending < 5 か<br>MAX_PENDING"}
    N -- いいえ --> X
    N -- はい --> O["pending を1増やして chrome.tts.speak"] --> P([読み上げ])
```

- A〜Kが `content.js`、「background.jsへ送る」から下が `background.js`
- エモート位置はTwitchがコードポイント単位で渡すため、UTF-16のindexで消すと絵文字を含む文でずれる
- 「読み上げを止める」ボタンは `chrome.tts.stop()` で待ち行列ごと消し、`pending` を0に戻す
