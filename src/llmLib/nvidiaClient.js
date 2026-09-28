// nvidiaClient.js
// 呼叫 NVIDIA API（build.nvidia.com / NIM，OpenAI 相容的 chat completions 格式）

import { fetchWithRetry } from "../common/fetchRetry.js";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

function parseJsonLoose(text) {
    // 沒開 strictJson 時模型可能會用 ```json ... ``` 包起來，先拆掉再 parse
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(match ? match[1].trim() : text.trim());
}

class NvidiaClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 NVIDIA API Key（請到擴充功能的設定頁面填寫）");
        this.apiKey = apiKey;
        this.model = model || "meta/llama-3.3-70b-instruct";
    }

    async generate(prompt, { json = false, temperature = 0.2, strictJson = true } = {}) {
        // strictJson 會用 response_format 強制模型輸出「JSON 物件」，最外層不是 {...} 就會被拒絕；
        // 要陣列形狀的資料（例如翻譯）就關掉，改用 parseJsonLoose 自己寬鬆解析。
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
                ...(json && strictJson ? { response_format: { type: "json_object" } } : {}),
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`NVIDIA API ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (!text) throw new Error("NVIDIA 沒有回傳內容");
        return json ? parseJsonLoose(text) : text;
    }
}

export { NvidiaClient };
