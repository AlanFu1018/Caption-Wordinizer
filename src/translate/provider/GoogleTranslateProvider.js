// GoogleTranslateProvider.js
// 使用 Google 翻譯的公開端點（不需要 API Key）

import { Translator } from "../Translator.js";
import { fetchWithRetry } from "../../common/fetchRetry.js";

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

class GoogleTranslateProvider extends Translator {
    async translateOne(text, targetLang) {
        const params = new URLSearchParams({ client: "gtx", sl: "ja", tl: targetLang, dt: "t" });
        const res = await fetchWithRetry(`${ENDPOINT}?${params}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: new URLSearchParams({ q: text }),
        });
        if (!res.ok) throw new Error(`Google Translate ${res.status}`);
        const data = await res.json();
        return (data[0] || []).map(seg => seg[0] || "").join("");
    }

    async translateBatch(texts, targetLang) {
        // 用換行把多句合併成一次請求，再切回來；句數對不上時退回逐句翻譯
        const joined = await this.translateOne(texts.join("\n"), targetLang);
        const parts = joined.split("\n").map(s => s.trim());
        if (parts.length === texts.length) return parts;
        return Promise.all(texts.map(t => this.translateOne(t, targetLang)));
    }
}

export { GoogleTranslateProvider };
