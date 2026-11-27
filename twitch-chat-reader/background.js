importScripts("defaults.js");

// 読み上げより速くコメントが来ると遅延が際限なく伸びるため、待ち行列を超えた分は捨てる
const MAX_PENDING = 5;
let pending = 0;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "speak") speak(msg.text);
  if (msg.type === "stop") { chrome.tts.stop(); pending = 0; }
});

async function speak(text) {
  const s = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) };
  if (!s.enabled || pending >= MAX_PENDING) return;
  pending++;
  const options = {
    enqueue: true, rate: Number(s.rate), volume: Number(s.volume), lang: "ja-JP",
    onEvent: (e) => {
      if (["end", "interrupted", "cancelled", "error"].includes(e.type)) pending = Math.max(0, pending - 1);
    },
  };
  if (s.voiceName) options.voiceName = s.voiceName;
  chrome.tts.speak(text, options);
}
