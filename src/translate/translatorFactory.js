// translatorFactory.js
// 依照設定選擇具體的翻譯實作

import { GoogleTranslateProvider } from "./provider/GoogleTranslateProvider.js";
import { GeminiTranslateProvider } from "./provider/GeminiTranslateProvider.js";
import { NvidiaTranslateProvider } from "./provider/NvidiaTranslateProvider.js";
import { GroqTranslateProvider } from "./provider/GroqTranslateProvider.js";

function createTranslator(settings) {
    if (settings.translateProvider !== "llm") return new GoogleTranslateProvider();
    // "llm" 時實際用哪個 provider 由 settings.llmProvider 決定，跟單字卡生成共用同一個選擇
    switch (settings.llmProvider) {
        case "nvidia":
            return new NvidiaTranslateProvider({ apiKey: settings.nvidiaApiKey, model: settings.nvidiaModel });
        case "groq":
            return new GroqTranslateProvider({ apiKey: settings.groqApiKey, model: settings.groqModel });
        case "gemini":
        default:
            return new GeminiTranslateProvider({ apiKey: settings.geminiApiKey, model: settings.geminiModel });
    }
}

export { createTranslator };
