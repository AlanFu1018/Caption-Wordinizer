// geminiClient.js
// 呼叫 Google Gemini API（generateContent）

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

class GeminiClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 Gemini API Key（請到擴充功能的設定頁面填寫）");
        this.apiKey = apiKey;
        this.model = model || "gemini-3.1-flash-lite";
    }

    async generate(prompt, { json = false, temperature = 0.2 } = {}) {
        const res = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature,
                    ...(json ? { responseMimeType: "application/json" } : {}),
                },
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
        if (!text) throw new Error("Gemini 沒有回傳內容");
        return json ? JSON.parse(text) : text;
    }
}

export { GeminiClient };
