importScripts("defaults.js");

// 読み上げより速くコメントが来ると遅れが際限なく伸びるため、待ちは新しいものだけを残す
const MAX_WAITING = 5;
let waiting = [];
let speaking = false;
// 止めた後に届く古い発話の終了イベントで、次の発話を始めないための番号
let generation = 0;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "speak") enqueue(msg.text);
  if (msg.type === "stop") stopAll(true);
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

function announce(text, s) {
  try { chrome.tts.speak(text, voiceOptions(s)); } catch (e) { console.warn(e); }
}

async function enqueue(text) {
  if (!(await loadSettings()).enabled) return;
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
}
