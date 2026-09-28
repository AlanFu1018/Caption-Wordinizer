// settings.js
// 所有模組（content / background / popup）共用的設定讀寫
// 一般設定存在 chrome.storage.sync；API Key 不在這裡，見 secrets.js

// kuromoji (IPADIC) 的主要詞性
const POS_LIST = [
    "名詞", "動詞", "形容詞", "副詞", "助詞", "助動詞",
    "連体詞", "接続詞", "感動詞", "接頭詞", "記号", "フィラー", "その他",
];

const TARGET_LANGUAGES = {
    "zh-TW": "繁體中文",
    "en": "English",
};

const DEFAULT_SETTINGS = {
    enabled: true,
    uiLang: "zh-TW",                  // 介面語言 "zh-TW" | "en"，和翻譯語言無關
    targetLang: "zh-TW",
    translateProvider: "google",      // "google" | "gemini"
    wordcardProvider: "gemini",       // "gemini"
    geminiModel: "gemini-3.1-flash-lite",
    showTranslation: true,
    sentenceSplit: true,              // 依標點符號重新斷句（關閉則用 YouTube 原本的斷行）
    // 要顯示詞性名稱的詞性
    posLabels: ["動詞", "形容詞", "助動詞"],
};

async function loadSettings() {
    const stored = await chrome.storage.sync.get("settings");
    return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function saveSettings(patch) {
    const current = await loadSettings();
    const next = { ...current, ...patch };
    await chrome.storage.sync.set({ settings: next });
    return next;
}

function onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.settings) {
            callback({ ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) });
        }
    });
}

export { POS_LIST, TARGET_LANGUAGES, DEFAULT_SETTINGS, loadSettings, saveSettings, onSettingsChanged };
