// ccFetcher.js
// 一次性抓取該影片所有日文字幕

const BRIDGE = "cw-bridge";
const CONTENT = "cw-content";

let reqCounter = 0;

function requestPlayerData() {
    /*向 ytBridge (MAIN world) 要播放器資料*/
    return new Promise((resolve) => {
        const reqId = ++reqCounter;
        const timer = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            resolve(null);
        }, 3000);
        function onMessage(event) {
            const msg = event.data;
            if (event.source !== window || !msg || msg.source !== BRIDGE) return;
            if (msg.type !== "player-data" || msg.reqId !== reqId) return;
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            resolve(msg);
        }
        window.addEventListener("message", onMessage);
        window.postMessage({ source: CONTENT, type: "get-player-data", reqId }, "*");
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForTimedtextUrl(videoId, timeoutMs, excludeUrl = null) {
    /*用輪詢而不是等通知：字幕開著的影片一載入播放器就會自己抓字幕，
      通知可能在我們開始等之前就發出而錯過，但 ytBridge 會記下網址，輪詢一定拿得到。
      excludeUrl：已經試過下載失敗的網址，要等播放器發出新的請求*/
    const deadline = Date.now() + timeoutMs;
    do {
        const data = await requestPlayerData();
        const url = data && data.videoId === videoId ? data.timedtextUrl : null;
        if (url && url !== excludeUrl) return url;
        if (Date.now() >= deadline) break;
        await sleep(500);
    } while (Date.now() < deadline);
    return null;
}

async function getPlayerDataFor(videoId) {
    /*SPA 換頁後播放器資料可能還是舊的，等到 videoId 對上為止*/
    for (let i = 0; i < 20; i++) {
        const data = await requestPlayerData();
        if (data && data.videoId === videoId) return data;
        await sleep(500);
    }
    return null;
}

function pickJapaneseTrack(tracks) {
    /*人工字幕優先，其次自動產生（asr）字幕*/
    const ja = tracks.filter(t => t.languageCode === "ja" || t.languageCode.startsWith("ja-"));
    return ja.find(t => t.kind !== "asr") || ja[0] || null;
}

function toJson3Url(url, track) {
    const u = new URL(url, location.origin);
    u.searchParams.set("fmt", "json3");
    u.searchParams.set("lang", track.languageCode);
    u.searchParams.delete("tlang");
    if (track.kind === "asr") u.searchParams.set("kind", "asr");
    else u.searchParams.delete("kind");
    return u.href;
}

async function tryFetchJson(url) {
    try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

// 字幕裡的音效 / 說明標籤，例如 [音楽]、[拍手]、［笑い］（半形與全形方括號）
const BRACKET_TAG = /\[[^\]]*\]|［[^］]*］/g;

function cleanCaptionText(raw) {
    return raw
        .replace(/\n/g, " ")
        .replace(BRACKET_TAG, "")
        .replace(/[ 　]{2,}/g, " ")   // 刪掉標籤後留下的多餘空白
        .trim();
}

function wordsOf(e, text) {
    /*自動字幕的每個 seg 是一個詞，tOffsetMs 是它在這行的第幾毫秒（第一個詞省略，代表 0）。
      有逐詞時間、且詞接起來和整理後的文字一致時才回傳 [{text, start}]，否則回傳 null*/
    const segs = e.segs.filter(s => s.utf8 && s.utf8 !== "\n");
    if (segs.length < 2 || !segs.slice(1).every(s => "tOffsetMs" in s)) return null;
    const words = segs.map(s => ({
        text: s.utf8,
        start: ((e.tStartMs || 0) + (s.tOffsetMs || 0)) / 1000,
    }));
    return words.map(w => w.text).join("") === text ? words : null;
}

function parseJson3(data) {
    /*把 json3 格式整理成 [{text, start, end, words?}]，時間單位為秒
      words 只有自動字幕才有：[{text, start}]，給 ccSegmenter 精確切時間用*/
    const events = (data?.events || []).filter(e => e.segs);
    const lines = [];
    for (const e of events) {
        const text = cleanCaptionText(e.segs.map(s => s.utf8 || "").join(""));
        if (!text) continue;   // 整句只有標籤（例如只有 [音楽]）就整句略過
        const start = (e.tStartMs || 0) / 1000;
        const end = start + (e.dDurationMs || 0) / 1000;
        const line = { text, start, end };
        const words = wordsOf(e, text);
        if (words) line.words = words;
        lines.push(line);
    }
    // 自動字幕的時間區段會互相重疊，截到下一句開始為止
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].end > lines[i + 1].start) lines[i].end = lines[i + 1].start;
    }
    return lines;
}

async function fetchAllCaptions(videoId) {
    /*async function to fetch all caption at once for a video*/

    // 1. 從頁面拿到 YouTube 的播放器資料
    const playerData = await getPlayerDataFor(videoId);
    if (!playerData || playerData.tracks.length === 0) {
        console.warn("[Caption Wordinizer] 這支影片沒有字幕軌");
        return null;
    }

    // 2. 找日文字幕軌
    const track = pickJapaneseTrack(playerData.tracks);
    if (!track) {
        console.warn("[Caption Wordinizer] 找不到日文字幕");
        return null;
    }

    // 3. 先直接用 baseUrl 下載
    let data = await tryFetchJson(toJson3Url(track.baseUrl, track));

    // 4. 失敗的話（YouTube 需要驗證參數），請播放器自己開啟字幕，攔截它的請求網址再下載
    let failReason = null;
    if (!data) {
        // 下載 baseUrl 的期間播放器可能已經自己抓過字幕，先用最新紀錄試試
        const recorded = await waitForTimedtextUrl(videoId, 0);
        if (recorded) data = await tryFetchJson(toJson3Url(recorded, track));
        // 沒有紀錄或紀錄的網址不能用：請播放器（重新）開字幕，等它發出新的請求
        if (!data) {
            window.postMessage({ source: CONTENT, type: "enable-captions", languageCode: track.languageCode, kind: track.kind }, "*");
            const fresh = await waitForTimedtextUrl(videoId, 15000, recorded);
            if (fresh) data = await tryFetchJson(toJson3Url(fresh, track));
            if (!data) failReason = fresh ? "播放器的字幕網址下載回來是空的" : "等不到播放器發出字幕請求";
        }
    }

    if (!data) {
        console.warn(`[Caption Wordinizer] 字幕下載失敗（${failReason}）`);
        return null;
    }

    const captions = parseJson3(data);
    return captions.length ? captions : null;
}

export { fetchAllCaptions, parseJson3 };
