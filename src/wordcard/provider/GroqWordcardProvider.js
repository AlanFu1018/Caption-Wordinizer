// GroqWordcardProvider.js
// 用 Groq API 生成單字的意思與說明

import { WordcardInfoProvider } from "../WordcardInfoProvider.js";
import { GroqClient } from "../../llmLib/groqClient.js";
import { buildWordcardPrompt, readWordcardInfo } from "../llmWordcardPrompt.js";

class GroqWordcardProvider extends WordcardInfoProvider {
    constructor({ apiKey, model }) {
        super();
        this.client = new GroqClient({ apiKey, model });
    }

    async getInfo(input, targetLang) {
        return readWordcardInfo(await this.client.generate(buildWordcardPrompt(input, targetLang), { json: true }));
    }
}

export { GroqWordcardProvider };
