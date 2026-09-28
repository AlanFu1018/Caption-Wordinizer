// GeminiTranslateProvider.js
// 使用 Gemini 翻譯，會參考前後文，翻譯較自然

import { Translator } from "../Translator.js";
import { GeminiClient } from "../../llmLib/geminiClient.js";
import { buildTranslatePrompt, readTranslations } from "../llmTranslatePrompt.js";

class GeminiTranslateProvider extends Translator {
    constructor({ apiKey, model }) {
        super();
        this.client = new GeminiClient({ apiKey, model });
    }

    async translateBatch(texts, targetLang, context = {}) {
        const result = await this.client.generate(buildTranslatePrompt(texts, targetLang, context), { json: true });
        return readTranslations(result, texts.length, "Gemini");
    }
}

export { GeminiTranslateProvider };
