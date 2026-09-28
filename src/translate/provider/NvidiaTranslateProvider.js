// NvidiaTranslateProvider.js
// 使用 NVIDIA API 翻譯，會參考前後文，翻譯較自然

import { Translator } from "../Translator.js";
import { NvidiaClient } from "../../llmLib/nvidiaClient.js";

const LANG_NAMES = { "zh-TW": "Traditional Chinese (Taiwan)", "en": "English" };

class NvidiaTranslateProvider extends Translator {
    constructor({ apiKey, model }) {
        super();
        this.client = new NvidiaClient({ apiKey, model });
    }

    async translateBatch(texts, targetLang) {
        const prompt = [
            `Translate each Japanese video subtitle line below into ${LANG_NAMES[targetLang] || targetLang}.`,
            "The lines are consecutive, so use the surrounding lines as context.",
            `Return a JSON object of the form {"translations": [...]}, containing exactly ${texts.length} strings, one translation per input line, in the same order.`,
            "",
            JSON.stringify(texts),
        ].join("\n");

        // 翻譯結果本質是陣列，關掉 strictJson 避免 json_object 模式因為最外層不是物件而拒絕
        const result = await this.client.generate(prompt, { json: true, strictJson: false });
        const arr = Array.isArray(result) ? result : result.translations;
        if (!Array.isArray(arr) || arr.length !== texts.length) {
            throw new Error("NVIDIA 回傳的翻譯句數不符");
        }
        return arr.map(s => String(s));
    }
}

export { NvidiaTranslateProvider };
