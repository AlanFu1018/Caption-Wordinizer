// WordcardInfoProvider.js
// 單字卡資訊生成的介面：所有 provider 都要繼承並實作 getInfo

class WordcardInfoProvider {
    /**
     * @param {{word: string, surface: string, reading: string, pos: string, sentence: string}} input
     * @param {string} targetLang "zh-TW" | "en"
     * @returns {Promise<{meaning: string, reading?: string, explanation?: string}>}
     */
    async getInfo(input, targetLang) {
        throw new Error("getInfo() not implemented");
    }
}

export { WordcardInfoProvider };
