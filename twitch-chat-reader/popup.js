const $ = (id) => document.getElementById(id);
const FIELDS = Object.keys(DEFAULT_SETTINGS);

function showRangeValues() {
  $("rateValue").textContent = `${$("rate").value}倍`;
  $("volumeValue").textContent = `${Math.round($("volume").value * 100)}%`;
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
    el.addEventListener("input", () => {
      const value = el.type === "checkbox" ? el.checked : el.type === "range" || el.type === "number" ? Number(el.value) : el.value;
      chrome.storage.sync.set({ [key]: value });
      showRangeValues();
    });
  }
  showRangeValues();
}

$("test").addEventListener("click", () => chrome.runtime.sendMessage({ type: "speak", text: "テストです。コメントをこの声で読み上げます" }));
$("stop").addEventListener("click", () => chrome.runtime.sendMessage({ type: "stop" }));
init();
