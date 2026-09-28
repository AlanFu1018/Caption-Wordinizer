// translatorFactory.js
// 依照設定選擇具體的翻譯實作

import { GoogleTranslateProvider } from "./provider/GoogleTranslateProvider.js";
import { GeminiTranslateProvider } from "./provider/GeminiTranslateProvider.js";

function createTranslator(settings) {
    switch (settings.translateProvider) {
        case "gemini":
            return new GeminiTranslateProvider({ apiKey: settings.geminiApiKey, model: settings.geminiModel });
        case "google":
        default:
            return new GoogleTranslateProvider();
    }
}

export { createTranslator };
