// Translator.js
// 翻譯介面：所有翻譯 provider 都要繼承並實作 translateBatch

class Translator {
    /**
     * @param {string[]} texts 日文字幕（每句一個）
     * @param {string} targetLang "zh-TW" | "en"
     * @returns {Promise<string[]>} 與 texts 一一對應的翻譯
     */
    async translateBatch(texts, targetLang) {
        throw new Error("translateBatch() not implemented");
    }
}

export { Translator };
