// ytBridge.js
// 跑在頁面本身的 JS 環境（MAIN world）。
// content script 在隔離環境中拿不到 YouTube 的播放器資料，所以透過這支腳本用 postMessage 轉交。
(function () {
    const SOURCE_OUT = "cw-bridge";
    const SOURCE_IN = "cw-content";

    // videoId -> 播放器自己發出的 timedtext 請求網址（含 pot 等驗證參數）
    const timedtextUrls = {};

    function recordUrl(url) {
        try {
            const u = new URL(url, location.origin);
            if (!u.pathname.includes("/api/timedtext")) return;
            const videoId = u.searchParams.get("v");
            if (!videoId) return;
            timedtextUrls[videoId] = u.href;
            window.postMessage({ source: SOURCE_OUT, type: "timedtext-url", videoId, url: u.href }, "*");
        } catch (e) { /* 忽略無法解析的網址 */ }
    }

    // 監聽播放器的字幕請求
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === "string" || url instanceof URL) recordUrl(String(url));
        return origOpen.apply(this, arguments);
    };
    const origFetch = window.fetch;
    window.fetch = function (input) {
        try {
            recordUrl(typeof input === "string" ? input : (input && input.url) || String(input));
        } catch (e) { /* ignore */ }
        return origFetch.apply(this, arguments);
    };

    function getPlayer() {
        return document.getElementById("movie_player");
    }

    function getPlayerResponse() {
        const player = getPlayer();
        const fromPlayer = player && typeof player.getPlayerResponse === "function"
            ? player.getPlayerResponse() : null;
        return fromPlayer || window.ytInitialPlayerResponse || null;
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.source !== SOURCE_IN) return;

        if (msg.type === "get-player-data") {
            const pr = getPlayerResponse();
            const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
            window.postMessage({
                source: SOURCE_OUT,
                type: "player-data",
                reqId: msg.reqId,
                videoId: pr?.videoDetails?.videoId || null,
                title: pr?.videoDetails?.title || "",
                author: pr?.videoDetails?.author || "",
                tracks: tracks.map(t => ({
                    baseUrl: t.baseUrl,
                    languageCode: t.languageCode,
                    kind: t.kind || "",
                    vssId: t.vssId || "",
                })),
                timedtextUrl: timedtextUrls[pr?.videoDetails?.videoId] || null,
            }, "*");
        }

        if (msg.type === "enable-captions") {
            // 讓播放器自己去要字幕，這樣請求會帶有 YouTube 需要的驗證參數
            const player = getPlayer();
            try {
                player.loadModule && player.loadModule("captions");
                player.setOption("captions", "track", { languageCode: msg.languageCode, kind: msg.kind || undefined });
            } catch (e) {
                console.warn("[Caption Wordinizer] enable captions failed", e);
            }
        }
    });
})();
