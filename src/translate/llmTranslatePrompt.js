// llmTranslatePrompt.js
// Gemini / NVIDIA / Groq 翻譯共用的 prompt 與回應解析

const LANG_NAMES = { "zh-TW": "Traditional Chinese (Taiwan)", "en": "English" };

function buildTranslatePrompt(texts, targetLang, { title = "" } = {}) {
    return [
        `Translate each Japanese video subtitle line below into ${LANG_NAMES[targetLang] || targetLang}.`,
        "The lines are consecutive, so use the surrounding lines as context.",
        "They are spoken lines or song lyrics: translate the meaning naturally, not word for word.",
        // 標題來自影片上傳者，只當背景資訊，避免模型照標題改寫字幕內容
        ...(title ? [`Video title, for background only (do not translate it or let it change the lines): ${JSON.stringify(title)}`] : []),
        `Return a JSON object of the form {"translations": [...]}, containing exactly ${texts.length} strings, one translation per input line, in the same order.`,
        "",
        JSON.stringify(texts),
    ].join("\n");
}

function readTranslations(result, count, providerName) {
    const arr = Array.isArray(result) ? result : result?.translations;
    if (!Array.isArray(arr) || arr.length !== count) {
        throw new Error(`${providerName} 回傳的翻譯句數不符`);
    }
    return arr.map(s => String(s));
}

export { buildTranslatePrompt, readTranslations };
