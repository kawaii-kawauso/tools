const DEFAULT_SETTINGS = {
  enabled: true,
  engine: "chrome",
  bouyomiPort: 50080,
  readName: true,
  rate: 1.2,
  volume: 1.0,
  voiceName: "",
  maxLength: 60,
  ignoreCommands: true,
  ignoreBroadcaster: true,
  ignoreUsers: "nightbot\nstreamelements\nmoobot",
  ngWords: "",
  channels: "",
};

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function settingLines(value) {
  return String(value ?? "").split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
