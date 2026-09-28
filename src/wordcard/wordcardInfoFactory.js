// wordcardInfoFactory.js
// 選擇具體用哪一個 LLM 的實作生成單字卡資訊

import { GeminiWordcardProvider } from "./provider/GeminiWordcardProvider.js";

function createWordcardInfoProvider(settings) {
    switch (settings.wordcardProvider) {
        case "gemini":
        default:
            return new GeminiWordcardProvider({ apiKey: settings.geminiApiKey, model: settings.geminiModel });
    }
}

export { createWordcardInfoProvider };
