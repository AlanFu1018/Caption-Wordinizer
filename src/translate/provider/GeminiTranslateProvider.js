// GeminiTranslateProvider.js
// 使用 Gemini 翻譯，會參考前後文，翻譯較自然

import { Translator } from "../Translator.js";
import { GeminiClient } from "../../llmLib/geminiClient.js";

const LANG_NAMES = { "zh-TW": "Traditional Chinese (Taiwan)", "en": "English" };

class GeminiTranslateProvider extends Translator {
    constructor({ apiKey, model }) {
        super();
        this.client = new GeminiClient({ apiKey, model });
    }

    async translateBatch(texts, targetLang) {
        const prompt = [
            `Translate each Japanese video subtitle line below into ${LANG_NAMES[targetLang] || targetLang}.`,
            "The lines are consecutive, so use the surrounding lines as context.",
            `Return a JSON object of the form {"translations": [...]}, containing exactly ${texts.length} strings, one translation per input line, in the same order.`,
            "",
            JSON.stringify(texts),
        ].join("\n");

        const result = await this.client.generate(prompt, { json: true });
        const arr = Array.isArray(result) ? result : result.translations;
        if (!Array.isArray(arr) || arr.length !== texts.length) {
            throw new Error("Gemini 回傳的翻譯句數不符");
        }
        return arr.map(s => String(s));
    }
}

export { GeminiTranslateProvider };
