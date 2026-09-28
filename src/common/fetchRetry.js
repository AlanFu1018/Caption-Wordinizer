// fetchRetry.js
// 針對 503（伺服器過載／暫時無法使用）做指數退避重試的 fetch 包裝
// 其他狀態碼（4xx 等）視為不可重試，直接把 response 交回呼叫端處理

const DEFAULT_OPTIONS = {
    maxRetries: 4,          // 最多重試次數（不含第一次請求）
    baseDelayMs: 500,       // 第一次重試的基準延遲
    maxDelayMs: 8000,       // 延遲上限
    retryStatuses: [503],
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt, { baseDelayMs, maxDelayMs }) {
    // attempt 從 0 開始算；每次重試延遲翻倍，並加入隨機抖動避免多個請求同時重試
    const cap = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
    return cap / 2 + Math.random() * (cap / 2);
}

function retryAfterMs(res) {
    const header = res.headers?.get?.("Retry-After");
    if (!header) return null;
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function fetchWithRetry(url, init = {}, retryOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, init);
        const isLastAttempt = attempt >= opts.maxRetries;
        if (!opts.retryStatuses.includes(res.status) || isLastAttempt) return res;
        await sleep(retryAfterMs(res) ?? backoffDelay(attempt, opts));
    }
}

export { fetchWithRetry };
