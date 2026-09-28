// gptClient.js
// 呼叫 OpenAI Chat Completions API（目前尚未接到任何 provider，見 doc/wait-feat.md）

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

class GptClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 OpenAI API Key");
        this.apiKey = apiKey;
        this.model = model || "gpt-4o-mini";
    }

    async generate(prompt, { json = false, temperature = 0.2 } = {}) {
        const res = await fetch(OPENAI_ENDPOINT, {
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
            throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (!text) throw new Error("OpenAI 沒有回傳內容");
        return json ? JSON.parse(text) : text;
    }
}

export { GptClient };
