// GeminiWordcardProvider.js
// 用 Gemini 生成單字的意思與說明

import { WordcardInfoProvider } from "../WordcardInfoProvider.js";
import { GeminiClient } from "../../llmLib/geminiClient.js";
import { buildWordcardPrompt, readWordcardInfo } from "../llmWordcardPrompt.js";

class GeminiWordcardProvider extends WordcardInfoProvider {
    constructor({ apiKey, model }) {
        super();
        this.client = new GeminiClient({ apiKey, model });
    }

    async getInfo(input, targetLang) {
        return readWordcardInfo(await this.client.generate(buildWordcardPrompt(input, targetLang), { json: true }));
    }
}

export { GeminiWordcardProvider };
