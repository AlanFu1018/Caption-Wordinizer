// translatorFactory.js
// 依照設定選擇具體的翻譯實作

import { GoogleTranslateProvider } from "./provider/GoogleTranslateProvider.js";
import { GeminiTranslateProvider } from "./provider/GeminiTranslateProvider.js";
import { NvidiaTranslateProvider } from "./provider/NvidiaTranslateProvider.js";
import { GroqTranslateProvider } from "./provider/GroqTranslateProvider.js";

function createTranslator(settings) {
    switch (settings.translateProvider) {
        case "gemini":
            return new GeminiTranslateProvider({ apiKey: settings.geminiApiKey, model: settings.geminiModel });
        case "nvidia":
            return new NvidiaTranslateProvider({ apiKey: settings.nvidiaApiKey, model: settings.nvidiaModel });
        case "groq":
            return new GroqTranslateProvider({ apiKey: settings.groqApiKey, model: settings.groqModel });
        case "google":
        default:
            return new GoogleTranslateProvider();
    }
}

export { createTranslator };
