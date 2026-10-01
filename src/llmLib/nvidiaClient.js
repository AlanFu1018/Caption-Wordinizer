// nvidiaClient.js
// 呼叫 NVIDIA API（build.nvidia.com / NIM，OpenAI 相容的 chat completions 格式）

import { fetchWithRetry } from "../common/fetchRetry.js";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

function parseJsonLoose(text) {
    // 模型可能會用 ```json ... ``` 包起來，或在 JSON 前後多寫說明文字
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fence ? fence[1] : text).trim();
    try {
        return JSON.parse(body);
    } catch (err) {
        // 抓出第一個 { 或 [ 到最後一個對應的 } 或 ] 再試一次
        const start = body.search(/[{[]/);
        const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
        if (start === -1 || end <= start) throw err;
        return JSON.parse(body.slice(start, end + 1));
    }
}

class NvidiaClient {
    constructor({ apiKey, model }) {
        if (!apiKey) throw new Error("尚未設定 NVIDIA API Key（請到擴充功能的設定頁面填寫）");
        this.apiKey = apiKey;
        this.model = model || "meta/llama-3.3-70b-instruct";
    }

    async generate(prompt, { json = false, temperature = 0.2 } = {}) {
        // NIM 不接受沒有 schema 的 response_format: json_object（會回 400 "requires a JSON schema"），
        // 所以不送 response_format，只在 prompt 裡要求 JSON，再用 parseJsonLoose 自己寬鬆解析。
        const content = json ? `${prompt}\n\nRespond with JSON only, no other text.` : prompt;
        const res = await fetchWithRetry(NVIDIA_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                temperature,
                messages: [{ role: "user", content }],
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
