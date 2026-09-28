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
        // 模型常照樣回傳陣列，關掉 strictJson 避免 json_object 模式因為最外層不是物件而拒絕
        const result = await this.client.generate(buildTranslatePrompt(texts, targetLang, context), { json: true, strictJson: false });
        return readTranslations(result, texts.length, "NVIDIA");
    }
}

export { NvidiaTranslateProvider };
