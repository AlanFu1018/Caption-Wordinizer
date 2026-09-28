// nvidiaClient.js
// 呼叫 NVIDIA API（build.nvidia.com / NIM，OpenAI 相容的 chat completions 格式）

import { fetchWithRetry } from "../common/fetchRetry.js";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

class NvidiaClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 NVIDIA API Key（請到擴充功能的設定頁面填寫）");
        this.apiKey = apiKey;
        this.model = model || "meta/llama-3.3-70b-instruct";
    }

    async generate(prompt, { json = false, temperature = 0.2 } = {}) {
        const res = await fetchWithRetry(NVIDIA_ENDPOINT, {
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
            throw new Error(`NVIDIA API ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (!text) throw new Error("NVIDIA 沒有回傳內容");
        return json ? JSON.parse(text) : text;
    }
}

export { NvidiaClient };
