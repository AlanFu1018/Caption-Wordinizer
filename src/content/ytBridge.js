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
            // 只記播放器自己帶 pot 驗證參數的請求；頁面上也有不帶 pot 的字幕請求，
            // 那種網址下載回來是空的，若被記下會蓋掉能用的網址
            if (!u.searchParams.has("pot")) return;
            const videoId = u.searchParams.get("v");
            if (!videoId) return;
            timedtextUrls[videoId] = u.href;
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
                // 字幕本來就開著同一軌時 setOption 不會重新請求，先關掉再開，強制播放器發出新的請求
                player.setOption("captions", "track", {});
                setTimeout(() => {
                    try {
                        player.setOption("captions", "track", { languageCode: msg.languageCode, kind: msg.kind || undefined });
                    } catch (e) {
                        console.warn("[Caption Wordinizer] enable captions failed", e);
                    }
                }, 300);
            } catch (e) {
                console.warn("[Caption Wordinizer] enable captions failed", e);
            }
        }
    });
})();
