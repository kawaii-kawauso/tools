importScripts("defaults.js");

// 読み上げより速くコメントが来ると遅れが際限なく伸びるため、待ちは新しいものだけを残す
const MAX_WAITING = 5;
let waiting = [];
let speaking = false;
// 止めた後に届く古い発話の終了イベントで、次の発話を始めないための番号
let generation = 0;
// 棒読みちゃんに最後の停止以降なにか送ったか。設定変更から来た停止で「読み上げオフ」の案内を消さないために使う
let bouyomiSent = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "speak") enqueue(msg.text);
  if (msg.type === "stop") stopAll(true);
  if (msg.type === "test") {
    loadSettings().then((s) => say(msg.text, s)).then(sendResponse);
    return true;
  }
});
chrome.commands.onCommand.addListener(handleCommand);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled?.newValue === false) stopAll(false);
});

async function handleCommand(command) {
  if (command === "stop-reading") stopAll(true);
  if (command === "toggle-reading") {
    const s = await loadSettings();
    if (s.enabled) stopAll(true);
    await chrome.storage.sync.set({ enabled: !s.enabled });
    announce(s.enabled ? "読み上げオフ" : "読み上げオン", s);
  }
}

async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) };
}

function voiceOptions(s) {
  const options = {
    lang: "ja-JP",
    rate: clampNumber(Number(s.rate), 0.5, 3, DEFAULT_SETTINGS.rate),
    volume: clampNumber(Number(s.volume), 0, 1, DEFAULT_SETTINGS.volume),
  };
  if (s.voiceName) options.voiceName = s.voiceName;
  return options;
}

function bouyomiUrl(s, path) {
  return `http://localhost:${clampNumber(Number(s.bouyomiPort), 1, 65535, DEFAULT_SETTINGS.bouyomiPort)}${path}`;
}

// 棒読みちゃんは自前の待ち行列と声の設定を持つので、本文だけを渡して声・速さは棒読みちゃん側に任せる
async function sendToBouyomi(text, s) {
  try {
    const res = await fetch(bouyomiUrl(s, `/Talk?text=${encodeURIComponent(text)}`));
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: "棒読みちゃんに接続できません。起動しているか、HTTP連携のポートが合っているか確かめてください" };
  }
}

async function say(text, s) {
  if (s.engine === "bouyomi") return sendToBouyomi(text, s);
  try { chrome.tts.speak(text, voiceOptions(s)); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
}

function announce(text, s) {
  say(text, s);
}

async function enqueue(text) {
  const s = await loadSettings();
  if (!s.enabled) return;
  if (s.engine === "bouyomi") { bouyomiSent = true; sendToBouyomi(text, s); return; }
  waiting.push(text);
  if (waiting.length > MAX_WAITING) waiting.shift();
  if (!speaking) {
    speaking = true;
    speakNext(generation);
  }
}

async function speakNext(gen) {
  const s = await loadSettings();
  if (gen !== generation) return;
  const text = s.enabled ? waiting.shift() : undefined;
  if (text === undefined) { speaking = false; return; }
  try {
    // service workerが再起動して前の発話がまだ鳴っている場合に割り込まないよう、enqueueで後ろに積む
    chrome.tts.speak(text, {
      ...voiceOptions(s),
      enqueue: true,
      onEvent: (e) => {
        if (gen === generation && ["end", "interrupted", "cancelled", "error"].includes(e.type)) speakNext(gen);
      },
    });
  } catch (e) {
    console.warn(e);
    speakNext(gen);
  }
}

// 設定変更から来た停止では、ショートカットの「読み上げオフ」の案内まで消さないよう、自分の発話中だけ止める
function stopAll(force) {
  generation++;
  waiting = [];
  if (force || speaking) chrome.tts.stop();
  speaking = false;
  const clearBouyomi = force || bouyomiSent;
  bouyomiSent = false;
  loadSettings().then((s) => {
    if (s.engine !== "bouyomi" || !clearBouyomi) return;
    for (const path of ["/Clear", "/Skip"]) fetch(bouyomiUrl(s, path)).catch(() => {});
  });
}
