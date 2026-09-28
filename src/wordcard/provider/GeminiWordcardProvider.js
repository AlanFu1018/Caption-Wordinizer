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
        if (input.kind === "grammar") return this.getGrammarInfo(input, lang);
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
            `- "examples": an array of exactly 2 objects { "sentence", "translation" }: short, natural Japanese example sentences that use the word with the same meaning (different from the context sentence), each with a translation in ${lang}`,
        ].join("\n");

        const r = await this.client.generate(prompt, { json: true });
        return {
            meaning: String(r.meaning || ""),
            reading: String(r.reading || ""),
            explanation: String(r.explanation || ""),
            examples: (Array.isArray(r.examples) ? r.examples : [])
                .map(ex => ({ sentence: String(ex?.sentence || ""), translation: String(ex?.translation || "") }))
                .filter(ex => ex.sentence)
                .slice(0, 2),
        };
    }

    async getGrammarInfo(input, lang) {
        /*文法卡：助詞、助動詞、語尾（たら、たんだ、よね…）的功能與用法*/
        const prompt = [
            "You are a Japanese grammar reference for language learners.",
            `Grammar item (as it appears): ${input.word}`,
            input.host ? `It follows the word: ${input.host}` : "",
            `Part of speech (first part): ${input.pos}`,
            `Context sentence: ${input.sentence}`,
            "",
            "Return a JSON object with these keys:",
            `- "meaning": what this grammar item does in the sentence, in ${lang}, concise (e.g. "if / when (conditional)")`,
            "- \"reading\": the grammar item in hiragana",
            `- "explanation": one to three sentences in ${lang}: how it is formed / attached, its nuance, and what it means in this sentence. If it is several parts combined (e.g. た + ん + だ), briefly explain each part`,
            `- "examples": an array of exactly 2 objects { "sentence", "translation" }: short, natural Japanese example sentences using the same grammar (different from the context sentence), each with a translation in ${lang}`,
        ].filter(line => line !== "").join("\n");

        const r = await this.client.generate(prompt, { json: true });
        return {
            meaning: String(r.meaning || ""),
            reading: String(r.reading || ""),
            explanation: String(r.explanation || ""),
            examples: (Array.isArray(r.examples) ? r.examples : [])
                .map(ex => ({ sentence: String(ex?.sentence || ""), translation: String(ex?.translation || "") }))
                .filter(ex => ex.sentence)
                .slice(0, 2),
        };
    }
}

export { GeminiWordcardProvider };
