// NvidiaWordcardProvider.js
// 用 NVIDIA API 生成單字的意思與說明

import { WordcardInfoProvider } from "../WordcardInfoProvider.js";
import { NvidiaClient } from "../../llmLib/nvidiaClient.js";
import { buildWordcardPrompt, readWordcardInfo } from "../llmWordcardPrompt.js";

class NvidiaWordcardProvider extends WordcardInfoProvider {
    constructor({ apiKey, model }) {
        super();
        this.client = new NvidiaClient({ apiKey, model });
    }

    async getInfo(input, targetLang) {
        return readWordcardInfo(await this.client.generate(buildWordcardPrompt(input, targetLang), { json: true }));
    }
}

export { NvidiaWordcardProvider };
