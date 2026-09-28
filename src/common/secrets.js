// secrets.js
// API Key 的讀寫。存在 chrome.storage.local，並由 background 把 local 限制為只有
// 擴充功能自己的頁面（background / popup）能讀取，content script 讀不到。
// 只能在 background 與 popup 使用，content script 不要 import 這支檔案。

const GEMINI_KEY = "geminiApiKey";
const NVIDIA_KEY = "nvidiaApiKey";
const GROQ_KEY = "groqApiKey";

async function restrictLocalStorage() {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

async function getGeminiApiKey() {
    const stored = await chrome.storage.local.get(GEMINI_KEY);
    return stored[GEMINI_KEY] || "";
}

async function setGeminiApiKey(value) {
    if (value) await chrome.storage.local.set({ [GEMINI_KEY]: value });
    else await chrome.storage.local.remove(GEMINI_KEY);
}

async function getNvidiaApiKey() {
    const stored = await chrome.storage.local.get(NVIDIA_KEY);
    return stored[NVIDIA_KEY] || "";
}

async function setNvidiaApiKey(value) {
    if (value) await chrome.storage.local.set({ [NVIDIA_KEY]: value });
    else await chrome.storage.local.remove(NVIDIA_KEY);
}

async function getGroqApiKey() {
    const stored = await chrome.storage.local.get(GROQ_KEY);
    return stored[GROQ_KEY] || "";
}

async function setGroqApiKey(value) {
    if (value) await chrome.storage.local.set({ [GROQ_KEY]: value });
    else await chrome.storage.local.remove(GROQ_KEY);
}

async function migrateLegacySettings() {
    /*v0.1 把所有設定（含 API Key）一起存在 local 的 settings，拆開搬到新位置*/
    const { settings: legacy } = await chrome.storage.local.get("settings");
    if (!legacy) return;
    const { geminiApiKey, ...rest } = legacy;
    // 舊版會把當時的預設模型一起存下來，讓它改用新的預設值
    if (rest.geminiModel === "gemini-2.5-flash") delete rest.geminiModel;
    if (geminiApiKey && !(await getGeminiApiKey())) await setGeminiApiKey(geminiApiKey);
    const { settings: synced } = await chrome.storage.sync.get("settings");
    if (!synced) await chrome.storage.sync.set({ settings: rest });
    await chrome.storage.local.remove("settings");
}

export {
    restrictLocalStorage,
    getGeminiApiKey, setGeminiApiKey,
    getNvidiaApiKey, setNvidiaApiKey,
    getGroqApiKey, setGroqApiKey,
    migrateLegacySettings,
};
