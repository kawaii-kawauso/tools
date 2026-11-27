const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
// 配信ページ以外の第1パス要素。ここに当たるURLではチャットに接続しない
const NON_CHANNEL_PATHS = new Set([
  "directory", "videos", "settings", "subscriptions", "inventory", "wallet",
  "drops", "search", "downloads", "p", "turbo", "jobs", "friends", "messages",
]);

let settings = {};
let socket = null;
let currentChannel = null;

function channelFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "popout" || parts[0] === "embed") return parts[1]?.toLowerCase() ?? null;
  if (parts[0] === "moderator") return parts[1]?.toLowerCase() ?? null;
  if (!parts[0] || NON_CHANNEL_PATHS.has(parts[0])) return null;
  return parts[0].toLowerCase();
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
    for (const range of emote.split(":")[1].split(",")) {
      const [start, end] = range.split("-").map(Number);
      for (let i = start; i <= end; i++) chars[i] = "";
    }
  }
  return chars.join("");
}

function parsePrivmsg(line) {
  const m = line.match(/^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #\w+ :(.*)$/);
  if (!m) return null;
  const tags = m[1] ? parseTags(m[1]) : {};
  return { login: m[2], name: tags["display-name"] || m[2], text: stripEmotes(m[3], tags.emotes) };
}

function toSpeech(msg) {
  const ignored = settings.ignoreUsers.split(/\s+/).filter(Boolean).map((u) => u.toLowerCase());
  if (ignored.includes(msg.login.toLowerCase())) return null;
  if (settings.ignoreCommands && msg.text.startsWith("!")) return null;
  let text = msg.text.replace(/https?:\/\/\S+/g, "URL").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > settings.maxLength) text = text.slice(0, settings.maxLength) + "、以下略";
  return settings.readName ? `${msg.name}、${text}` : text;
}

function connect(channel) {
  if (socket) socket.close();
  currentChannel = channel;
  if (!channel) return;
  const ws = new WebSocket(IRC_URL);
  socket = ws;
  ws.onopen = () => {
    ws.send("CAP REQ :twitch.tv/tags");
    ws.send(`NICK justinfan${Math.floor(Math.random() * 90000) + 10000}`);
    ws.send(`JOIN #${channel}`);
  };
  ws.onmessage = (e) => {
    for (const line of String(e.data).split("\r\n")) {
      if (line.startsWith("PING")) { ws.send(line.replace("PING", "PONG")); continue; }
      const msg = parsePrivmsg(line);
      const text = msg && toSpeech(msg);
      if (text) chrome.runtime.sendMessage({ type: "speak", text });
    }
  };
  ws.onclose = () => {
    if (socket === ws) setTimeout(() => { if (socket === ws) connect(currentChannel); }, 3000);
  };
}

// TwitchはSPAで、チャンネル移動してもcontent scriptが再実行されないためURLを監視する
setInterval(() => {
  const channel = channelFromPath(location.pathname);
  if (channel !== currentChannel) connect(channel);
}, 1000);

chrome.storage.sync.get(null).then((stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  connect(channelFromPath(location.pathname));
});
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
});
