// WordcardInfoProvider.js
// 單字卡資訊生成的介面：所有 provider 都要繼承並實作 getInfo

class WordcardInfoProvider {
    /**
     * @param {{kind: "word"|"grammar", word: string, surface: string, reading: string, pos: string, sentence: string, host?: string}} input
     *   kind = "grammar" 時 word 是文法本身（たら、たんだ），host 是它接在後面的單字
     * @param {string} targetLang "zh-TW" | "en"
     * @returns {Promise<{meaning: string, reading?: string, explanation?: string, examples?: {sentence: string, translation: string}[]}>}
     */
    async getInfo(input, targetLang) {
        throw new Error("getInfo() not implemented");
    }
}

export { WordcardInfoProvider };
