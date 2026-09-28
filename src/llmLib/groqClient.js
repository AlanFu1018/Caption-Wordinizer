// groqClient.js
// 呼叫 Groq API（OpenAI 相容的 chat completions 格式）

import { fetchWithRetry } from "../common/fetchRetry.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

class GroqClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 Groq API Key（請到擴充功能的設定頁面填寫）");
        this.apiKey = apiKey;
        this.model = model || "llama-3.3-70b-versatile";
    }

    async generate(prompt, { json = false, temperature = 0.2 } = {}) {
        const res = await fetchWithRetry(GROQ_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                temperature,
                messages: [{ role: "user", content: prompt }],
                ...(json ? { response_format: { type: "json_object" } } : {}),
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Groq API ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (!text) throw new Error("Groq 沒有回傳內容");
        return json ? JSON.parse(text) : text;
    }
}

export { GroqClient };
