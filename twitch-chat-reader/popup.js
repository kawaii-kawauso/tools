const $ = (id) => document.getElementById(id);
const FIELDS = Object.keys(DEFAULT_SETTINGS);
// 同期ストレージは書き込みが毎分120回までなので、文字入力は打ち終わりを待ってから保存する
const TEXT_SAVE_DELAY_MS = 400;

function showRangeValues() {
  $("rateValue").textContent = `${$("rate").value}倍`;
  $("volumeValue").textContent = `${Math.round($("volume").value * 100)}%`;
}

function showEngineFields() {
  const engine = $("engine").value;
  for (const el of document.querySelectorAll(".chrome")) el.hidden = engine !== "chrome";
  for (const el of document.querySelectorAll(".bouyomi")) el.hidden = engine !== "bouyomi";
}

async function showShortcuts() {
  const commands = await chrome.commands.getAll();
  const label = { "toggle-reading": "ON/OFF", "stop-reading": "止める" };
  $("shortcuts").textContent = commands
    .filter((c) => label[c.name])
    .map((c) => `${label[c.name]}: ${c.shortcut || "未設定"}`)
    .join("　");
}

async function init() {
  const voices = await chrome.tts.getVoices();
  for (const v of voices.filter((v) => v.lang?.startsWith("ja"))) {
    $("voiceName").add(new Option(v.voiceName, v.voiceName));
  }
  const s = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) };
  for (const key of FIELDS) {
    const el = $(key);
    if (el.type === "checkbox") el.checked = s[key];
    else el.value = s[key];

    if (el.tagName === "TEXTAREA") {
      let pending = null;
      el.addEventListener("input", () => {
        clearTimeout(pending);
        pending = setTimeout(() => chrome.storage.sync.set({ [key]: el.value }), TEXT_SAVE_DELAY_MS);
      });
      continue;
    }
    el.addEventListener("input", () => { showRangeValues(); showEngineFields(); });
    el.addEventListener("change", () => {
      let value = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "number" || el.type === "range") {
        value = clampNumber(el.value === "" ? NaN : Number(el.value), Number(el.min), Number(el.max), s[key]);
        el.value = value;
      }
      s[key] = value;
      chrome.storage.sync.set({ [key]: value });
    });
  }
  showRangeValues();
  showEngineFields();
  showShortcuts();
}

$("test").addEventListener("click", async () => {
  $("testResult").textContent = "";
  const result = await chrome.runtime.sendMessage({ type: "test", text: "テストです。コメントをこの声で読み上げます" });
  if (!result?.ok) $("testResult").textContent = result?.error ?? "読み上げに失敗しました";
});
$("stop").addEventListener("click", () => chrome.runtime.sendMessage({ type: "stop" }));
$("editShortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
init();
