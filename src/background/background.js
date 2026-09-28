// background.js
// Service worker：負責所有對外的網路請求（翻譯、LLM），content script 透過 message 呼叫

import { loadSettings } from "../common/settings.js";
import { restrictLocalStorage, getGeminiApiKey, migrateLegacySettings } from "../common/secrets.js";
import { createTranslator } from "../translate/translatorFactory.js";
import { generateWordcard } from "../wordcard/wordcardGenerator.js";
import { addWordcard, findWordcard } from "../wordcard/wordcardDB.js";

// 每次 service worker 啟動都先把 local 限制成只有擴充功能頁面能讀（API Key 存在這裡）
const ready = restrictLocalStorage()
    .then(migrateLegacySettings)
    .catch(e => console.error("[Caption Wordinizer] storage init failed", e));

// 註冊這兩個事件，讓瀏覽器啟動 / 擴充功能安裝更新時 service worker 會馬上啟動並執行上面的設定
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(() => {});

async function loadSettingsWithSecrets() {
    /*API Key 只在 background 裡跟設定合併，不會回傳給 content script*/
    await ready;
    const [settings, geminiApiKey] = await Promise.all([loadSettings(), getGeminiApiKey()]);
    return { ...settings, geminiApiKey };
}

// 翻譯快取：`${provider}|${lang}|${text}` -> 翻譯
const translationCache = new Map();

async function handleTranslate({ texts }) {
    const settings = await loadSettingsWithSecrets();
    const prefix = `${settings.translateProvider}|${settings.targetLang}|`;
    const missing = [...new Set(texts.filter(t => !translationCache.has(prefix + t)))];
    if (missing.length) {
        const translator = createTranslator(settings);
        const results = await translator.translateBatch(missing, settings.targetLang);
        missing.forEach((t, i) => translationCache.set(prefix + t, results[i]));
    }
    return { translations: texts.map(t => translationCache.get(prefix + t) || "") };
}

async function handleAddWordcard(msg) {
    const existing = await findWordcard(msg.token.basicForm);
    if (existing) return { card: existing, duplicated: true };
    const settings = await loadSettingsWithSecrets();
    const { card, warning } = await generateWordcard(msg, settings);
    await addWordcard(card);
    return { card, warning };
}

const handlers = {
    "translate": handleTranslate,
    "wordcard:add": handleAddWordcard,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = handlers[msg?.type];
    if (!handler) return false;
    handler(msg)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // 非同步回應
});
