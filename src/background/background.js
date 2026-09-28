// background.js
// Service worker：負責所有對外的網路請求（翻譯、LLM），content script 透過 message 呼叫

import { loadSettings } from "../common/settings.js";
import { restrictLocalStorage, getGeminiApiKey, getNvidiaApiKey, getGroqApiKey, migrateLegacySettings } from "../common/secrets.js";
import { createTranslator } from "../translate/translatorFactory.js";
import { generateWordcard, fillWordcardInfo } from "../wordcard/wordcardGenerator.js";
import { addWordcard, findWordcard, getAllWordcards, updateWordcard, isFailedWordcard } from "../wordcard/wordcardDB.js";

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
    const [settings, geminiApiKey, nvidiaApiKey, groqApiKey] = await Promise.all([
        loadSettings(), getGeminiApiKey(), getNvidiaApiKey(), getGroqApiKey(),
    ]);
    return { ...settings, geminiApiKey, nvidiaApiKey, groqApiKey };
}

// 翻譯快取：`${provider}|${lang}|${text}` -> 翻譯
const translationCache = new Map();

async function handleTranslate({ texts, title = "" }) {
    const settings = await loadSettingsWithSecrets();
    const engineKey = settings.translateProvider === "llm" ? `llm-${settings.llmProvider}` : "google";
    const prefix = `${engineKey}|${settings.targetLang}|`;
    const missing = [...new Set(texts.filter(t => !translationCache.has(prefix + t)))];
    if (missing.length) {
        const translator = createTranslator(settings);
        let results;
        try {
            results = await translator.translateBatch(missing, settings.targetLang, { title });
        } catch (e) {
            // 錯誤訊息標出實際用的引擎，避免「Failed to fetch」這類訊息看不出是誰出錯
            throw new Error(`[${engineKey}] ${e.message}`);
        }
        missing.forEach((t, i) => translationCache.set(prefix + t, results[i]));
    }
    return { translations: texts.map(t => translationCache.get(prefix + t) || "") };
}

async function handleAddWordcard(msg) {
    const existing = await findWordcard(msg.token.basicForm, msg.token.kind === "grammar" ? "grammar" : "word");
    if (existing) return { card: existing, duplicated: true };
    const settings = await loadSettingsWithSecrets();
    const { card, warning } = await generateWordcard(msg, settings);
    await addWordcard(card);
    return { card, warning };
}

// 補生成：一張一張重跑 LLM，每張成功就馬上存；遇到錯誤（多半是 API Key / 額度問題）就停下來
let regenerating = null;

async function regenerateFailedWordcards() {
    const settings = await loadSettingsWithSecrets();
    const failed = (await getAllWordcards()).filter(isFailedWordcard);
    let fixed = 0;
    for (const card of failed) {
        try {
            await fillWordcardInfo(card, settings);
        } catch (e) {
            return { fixed, error: e.message };
        }
        if (await updateWordcard(card)) fixed++;
    }
    return { fixed };
}

function handleRegenerateWordcards() {
    // popup 重複按也只會跑一次
    regenerating ??= regenerateFailedWordcards().finally(() => { regenerating = null; });
    return regenerating;
}

const handlers = {
    "translate": handleTranslate,
    "wordcard:add": handleAddWordcard,
    "wordcard:regenerate": handleRegenerateWordcards,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = handlers[msg?.type];
    if (!handler) return false;
    handler(msg)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // 非同步回應
});
