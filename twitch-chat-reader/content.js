const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
// Twitchはおよそ5分ごとにPINGを送るので、それを超えて無通信なら回線が黙って切れたとみなす
const IDLE_TIMEOUT_MS = 6 * 60 * 1000;
const USER_COOLDOWN_MS = 5000;
// 配信ページ以外の第1パス要素。ここに当たるURLではチャットに接続しない
const NON_CHANNEL_PATHS = new Set([
  "directory", "videos", "settings", "subscriptions", "inventory", "wallet",
  "drops", "search", "downloads", "p", "turbo", "jobs", "friends", "messages",
  "team", "following", "store", "login", "signup", "u", "prime", "bits", "broadcast",
]);

let settings = { ...DEFAULT_SETTINGS };
let socket = null;
let currentChannel = null;
let lastReceivedAt = 0;
let lastText = "";
const lastSpokenAtByUser = new Map();
let timer = null;

function channelFromLocation({ hostname, pathname }) {
  const parts = pathname.split("/").filter(Boolean);
  let name = null;
  if (hostname === "dashboard.twitch.tv") name = parts[0] === "u" ? parts[1] : null;
  else if (["popout", "embed", "moderator"].includes(parts[0])) name = parts[1];
  else if (parts[0] && !NON_CHANNEL_PATHS.has(parts[0])) name = parts[0];
  name = name?.toLowerCase();
  return name && /^[a-z0-9_]{3,25}$/.test(name) ? name : null;
}

function targetChannel() {
  const channel = channelFromLocation(location);
  const allowed = settingLines(settings.channels);
  return channel && (allowed.length === 0 || allowed.includes(channel)) ? channel : null;
}

function parseTags(raw) {
  const tags = {};
  for (const pair of raw.split(";")) {
    const i = pair.indexOf("=");
    tags[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return tags;
}

// emotesタグの位置はコードポイント単位なので、UTF-16のindexではなく配列化して消す
function stripEmotes(text, emotesTag) {
  if (!emotesTag) return text;
  const chars = Array.from(text);
  for (const emote of emotesTag.split("/")) {
    for (const range of (emote.split(":")[1] ?? "").split(",")) {
      const [start, end] = range.split("-").map(Number);
      for (let i = start; i <= end; i++) chars[i] = "";
    }
  }
  return chars.join("");
}

function parsePrivmsg(line) {
  const m = line.match(/^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #\w+ :([\s\S]*)$/);
  if (!m) return null;
  const tags = m[1] ? parseTags(m[1]) : {};
  // /meの本文は\x01ACTION ...\x01で包まれて届く。エモート位置は包みを外した本文が基準
  const body = m[3].replace(/^\x01ACTION ([\s\S]*)\x01$/, "$1");
  return { login: m[2], name: tags["display-name"] || m[2], text: stripEmotes(body, tags.emotes) };
}

function normalize(text) {
  return text
    // SSMLとして解釈されて長い無音などを仕込まれないよう、タグと制御文字を消す
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/^\s*@\S+/, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[wｗ]{2,}/g, " わら ")
    .replace(/[8８]{3,}/g, " パチパチ ")
    .replace(/(.)\1{3,}/gu, "$1$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

function toSpeech(msg) {
  const ignored = settingLines(settings.ignoreUsers);
  if (ignored.includes(msg.login.toLowerCase()) || ignored.includes(msg.name.toLowerCase())) return null;
  if (settings.ignoreBroadcaster && msg.login.toLowerCase() === currentChannel) return null;
  if (settings.ignoreCommands && msg.text.trimStart().startsWith("!")) return null;
  const lower = msg.text.toLowerCase();
  if (settingLines(settings.ngWords).some((word) => lower.includes(word))) return null;

  let text = normalize(msg.text);
  if (!text || text === lastText) return null;
  const now = Date.now();
  if (now - (lastSpokenAtByUser.get(msg.login) ?? 0) < USER_COOLDOWN_MS) return null;
  lastText = text;
  lastSpokenAtByUser.set(msg.login, now);

  const maxLength = clampNumber(Number(settings.maxLength), 5, 500, DEFAULT_SETTINGS.maxLength);
  if (text.length > maxLength) text = text.slice(0, maxLength) + "、以下略";
  return settings.readName ? `${msg.name}、${text}` : text;
}

function send(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // 拡張の更新・再読み込みの後は、古いスクリプトから送れなくなる。接続を残すと無駄に受信し続けるので畳む
    shutdown();
  }
}

function shutdown() {
  clearInterval(timer);
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
}

function connect(channel) {
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  currentChannel = channel;
  lastText = "";
  lastSpokenAtByUser.clear();
  if (!channel) return;
  const ws = new WebSocket(IRC_URL);
  socket = ws;
  lastReceivedAt = Date.now();
  ws.onopen = () => {
    ws.send("CAP REQ :twitch.tv/tags");
    ws.send(`NICK justinfan${Math.floor(Math.random() * 90000) + 10000}`);
    ws.send(`JOIN #${channel}`);
  };
  ws.onmessage = (e) => {
    lastReceivedAt = Date.now();
    for (const line of String(e.data).split("\r\n")) {
      try {
        if (line.startsWith("PING")) { ws.send(line.replace("PING", "PONG")); continue; }
        const msg = parsePrivmsg(line);
        const text = msg && toSpeech(msg);
        if (text) send({ type: "speak", text });
      } catch (err) {
        console.warn("Twitch Chat Reader:", err);
      }
    }
  };
  ws.onclose = () => setTimeout(() => { if (socket === ws) connect(currentChannel); }, 3000);
}

// TwitchはSPAで、チャンネル移動してもcontent scriptが再実行されないためURLを監視する
function tick() {
  const channel = targetChannel();
  if (channel !== currentChannel) {
    if (currentChannel) send({ type: "stop" });
    connect(channel);
  } else if (socket?.readyState === WebSocket.OPEN && Date.now() - lastReceivedAt > IDLE_TIMEOUT_MS) {
    socket.close();
  }
}

chrome.storage.sync.get(null).then((stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  tick();
  timer = setInterval(tick, 1000);
});
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue ?? DEFAULT_SETTINGS[key];
});
