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

function waitForTimedtextUrl(videoId, timeoutMs) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            resolve(null);
        }, timeoutMs);
        function onMessage(event) {
            const msg = event.data;
            if (event.source !== window || !msg || msg.source !== BRIDGE) return;
            if (msg.type !== "timedtext-url" || msg.videoId !== videoId) return;
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            resolve(msg.url);
        }
        window.addEventListener("message", onMessage);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

function parseJson3(data) {
    /*把 json3 格式整理成 [{text, start, end}]，時間單位為秒*/
    const events = (data?.events || []).filter(e => e.segs);
    const lines = [];
    for (const e of events) {
        const text = e.segs.map(s => s.utf8 || "").join("").replace(/\n/g, " ").trim();
        if (!text) continue;
        const start = (e.tStartMs || 0) / 1000;
        const end = start + (e.dDurationMs || 0) / 1000;
        lines.push({ text, start, end });
    }
    // 自動字幕的時間區段會互相重疊，截到下一句開始為止
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].end > lines[i + 1].start) lines[i].end = lines[i + 1].start;
    }
    return lines;
}

async function fetchAllCaptions(videoId) {
    /*async function to fetch all caption at once for a video
      回傳 { captions: [{text, start, end}], video: {videoId, title, author} }，沒有字幕時回傳 null*/

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
    if (!data) {
        let url = playerData.timedtextUrl;
        if (!url) {
            const waiting = waitForTimedtextUrl(videoId, 10000);
            window.postMessage({ source: CONTENT, type: "enable-captions", languageCode: track.languageCode, kind: track.kind }, "*");
            url = await waiting;
        }
        if (url) data = await tryFetchJson(toJson3Url(url, track));
    }

    if (!data) {
        console.warn("[Caption Wordinizer] 字幕下載失敗");
        return null;
    }

    const captions = parseJson3(data);
    if (!captions.length) return null;
    // 影片資訊會跟著單字卡一起保存
    const video = { videoId, title: playerData.title || "", author: playerData.author || "" };
    return { captions, video };
}

export { fetchAllCaptions, parseJson3 };
