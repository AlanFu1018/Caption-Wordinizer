// wordcardGenerator.js
// 結合 tokenizer 的資料與 LLM 生成的資訊，產生完整單字卡

import { createWordcardInfoProvider } from "./wordcardInfoFactory.js";

async function generateWordcard({ token, sentence, translation, videoId, videoTitle, channelName, time }, settings) {
    const card = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        word: token.basicForm,
        surface: token.surface,
        // 原形的讀音（ccTokenizer 會另外算出 basicReading；token.reading 是出現形的讀音，例：走っ → はしっ）
        reading: token.basicReading || (token.surface === token.basicForm ? (token.reading || "") : ""),
        pos: token.pos,
        meaning: "",
        explanation: "",
        sentence,
        sentenceTranslation: translation || "",
        videoId: videoId || "",
        videoTitle: videoTitle || "",
        channelName: channelName || "",
        time: Math.floor(time || 0),
        createdAt: new Date().toISOString(),
    };

    // LLM 失敗（例如沒設定 API Key）時仍然保存基本資料，並回傳警告
    let warning = null;
    try {
        const provider = createWordcardInfoProvider(settings);
        const info = await provider.getInfo({
            word: card.word, surface: card.surface, reading: card.reading, pos: card.pos, sentence,
        }, settings.targetLang);
        card.meaning = info.meaning;
        card.explanation = info.explanation || "";
        if (info.reading) card.reading = info.reading;
    } catch (e) {
        warning = e.message;
    }
    return { card, warning };
}

export { generateWordcard };
