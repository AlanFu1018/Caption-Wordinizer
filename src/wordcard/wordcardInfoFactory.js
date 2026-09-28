// wordcardInfoFactory.js
// 選擇具體用哪一個 LLM 的實作生成單字卡資訊

import { GeminiWordcardProvider } from "./provider/GeminiWordcardProvider.js";
import { NvidiaWordcardProvider } from "./provider/NvidiaWordcardProvider.js";
import { GroqWordcardProvider } from "./provider/GroqWordcardProvider.js";

function createWordcardInfoProvider(settings) {
    // 單字卡生成永遠用 LLM，且跟翻譯用同一個 provider（見 settings.llmProvider）
    switch (settings.llmProvider) {
        case "nvidia":
            return new NvidiaWordcardProvider({ apiKey: settings.nvidiaApiKey, model: settings.nvidiaModel });
        case "groq":
            return new GroqWordcardProvider({ apiKey: settings.groqApiKey, model: settings.groqModel });
        case "gemini":
        default:
            return new GeminiWordcardProvider({ apiKey: settings.geminiApiKey, model: settings.geminiModel });
    }
}

export { createWordcardInfoProvider };
