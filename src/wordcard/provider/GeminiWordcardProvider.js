// GeminiWordcardProvider.js
// 用 Gemini 生成單字的意思與說明

import { WordcardInfoProvider } from "../WordcardInfoProvider.js";
import { GeminiClient } from "../../llmLib/geminiClient.js";

const LANG_NAMES = { "zh-TW": "Traditional Chinese (Taiwan)", "en": "English" };

class GeminiWordcardProvider extends WordcardInfoProvider {
    constructor({ apiKey, model }) {
        super();
        this.client = new GeminiClient({ apiKey, model });
    }

    async getInfo(input, targetLang) {
        const lang = LANG_NAMES[targetLang] || targetLang;
        const prompt = [
            "You are a Japanese dictionary for language learners.",
            `Word (dictionary form): ${input.word}`,
            `As it appears: ${input.surface}`,
            `Part of speech: ${input.pos}`,
            `Context sentence: ${input.sentence}`,
            "",
            "Return a JSON object with these keys:",
            `- "meaning": a concise meaning of the word as used in the sentence, in ${lang}`,
            "- \"reading\": the reading of the dictionary form in hiragana",
            `- "explanation": one or two sentences in ${lang} about usage or nuance (and conjugation, if the surface form is conjugated)`,
        ].join("\n");

        const r = await this.client.generate(prompt, { json: true });
        return {
            meaning: String(r.meaning || ""),
            reading: String(r.reading || ""),
            explanation: String(r.explanation || ""),
        };
    }
}

export { GeminiWordcardProvider };
