// NvidiaTranslateProvider.js
// 使用 NVIDIA API 翻譯，會參考前後文，翻譯較自然

import { Translator } from "../Translator.js";
import { NvidiaClient } from "../../llmLib/nvidiaClient.js";
import { buildTranslatePrompt, readTranslations } from "../llmTranslatePrompt.js";

class NvidiaTranslateProvider extends Translator {
    constructor({ apiKey, model }) {
        super();
        this.client = new NvidiaClient({ apiKey, model });
    }

    async translateBatch(texts, targetLang, context = {}) {
        const result = await this.client.generate(buildTranslatePrompt(texts, targetLang, context), { json: true });
        return readTranslations(result, texts.length, "NVIDIA");
    }
}

export { NvidiaTranslateProvider };
