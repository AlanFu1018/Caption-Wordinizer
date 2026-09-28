// background.js
// Service worker：負責所有對外的網路請求（翻譯、LLM），content script 透過 message 呼叫

import { loadSettings } from "../common/settings.js";
import { createTranslator } from "../translate/translatorFactory.js";
import { generateWordcard } from "../wordcard/wordcardGenerator.js";
import { addWordcard, findWordcard } from "../wordcard/wordcardDB.js";

// 翻譯快取：`${provider}|${lang}|${text}` -> 翻譯
const translationCache = new Map();

async function handleTranslate({ texts }) {
    const settings = await loadSettings();
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
    const settings = await loadSettings();
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
