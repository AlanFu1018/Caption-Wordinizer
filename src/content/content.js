console.log("Caption Wordinizer loaded");

const TRANSLATE_CHUNK = 40;

function currentVideoId() {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
}

async function main() {
    const load = (path) => import(chrome.runtime.getURL(path));
    const [{ fetchAllCaptions }, { tokenizeCaptions }, { colorizeLines }, { CcDisplayer }, settingsLib] =
        await Promise.all([
            load("src/content/ccFetcher.js"),
            load("src/content/ccTokenizer.js"),
            load("src/content/tokenColorizer.js"),
            load("src/content/ccDisplayer.js"),
            load("src/common/settings.js"),
        ]);

    let settings = await settingsLib.loadSettings();
    let loadedVideoId = null;
    let session = 0; // 換影片時用來讓舊的非同步工作作廢

    const displayer = new CcDisplayer({
        onWordClick: async (token, line, translation) => {
            displayer.toast(`正在建立單字卡：${token.basicForm}…`);
            try {
                const res = await chrome.runtime.sendMessage({
                    type: "wordcard:add",
                    token,
                    sentence: line.text,
                    translation,
                    videoId: loadedVideoId,
                    time: line.start,
                });
                if (!res || !res.ok) throw new Error(res?.error || "unknown error");
                if (res.duplicated) displayer.toast(`「${res.card.word}」已經在單字卡中`);
                else if (res.warning) displayer.toast(`已加入 ${res.card.word}（未取得字義：${res.warning}）`);
                else displayer.toast(`已加入單字卡：${res.card.word} — ${res.card.meaning}`);
            } catch (e) {
                displayer.toast(`加入失敗：${e.message}`);
            }
        },
    });
    displayer.setOptions(settings);

    async function translateAll(lines, mySession) {
        /*從目前播放位置附近的區塊開始，分批請 background 翻譯*/
        const video = document.querySelector("#movie_player video");
        const now = video ? video.currentTime : 0;
        let first = lines.findIndex(l => l.end > now);
        if (first < 0) first = 0;
        const starts = [];
        for (let i = 0; i < lines.length; i += TRANSLATE_CHUNK) starts.push(i);
        const firstChunk = Math.floor(first / TRANSLATE_CHUNK) * TRANSLATE_CHUNK;
        starts.sort((a, b) => (a < firstChunk) - (b < firstChunk) || a - b);

        for (const start of starts) {
            if (mySession !== session || !settings.showTranslation) return;
            const texts = lines.slice(start, start + TRANSLATE_CHUNK).map(l => l.text);
            try {
                const res = await chrome.runtime.sendMessage({ type: "translate", texts });
                if (mySession !== session) return;
                if (!res || !res.ok) throw new Error(res?.error || "unknown error");
                res.translations.forEach((t, i) => displayer.setTranslation(start + i, t));
            } catch (e) {
                console.warn("[Caption Wordinizer] 翻譯失敗", e);
                displayer.toast(`翻譯失敗：${e.message}`);
                return;
            }
        }
    }

    async function loadVideo() {
        const videoId = currentVideoId();
        if (!settings.enabled || !videoId) {
            session++;
            loadedVideoId = null;
            displayer.unmount();
            return;
        }
        if (videoId === loadedVideoId) return;

        const mySession = ++session;
        loadedVideoId = videoId;
        displayer.unmount();

        const captions = await fetchAllCaptions(videoId);
        if (mySession !== session || !captions) return;

        const lines = colorizeLines(await tokenizeCaptions(captions));
        if (mySession !== session) return;

        displayer.setLines(lines);
        // 播放器可能還沒出現，稍等再掛上
        for (let i = 0; i < 20 && !displayer.mount(); i++) {
            await new Promise(r => setTimeout(r, 500));
            if (mySession !== session) return;
        }
        translateAll(lines, mySession);
    }

    settingsLib.onSettingsChanged((next) => {
        const prev = settings;
        settings = next;
        displayer.setOptions(settings);
        const needReload = prev.enabled !== next.enabled
            || prev.targetLang !== next.targetLang
            || prev.translateProvider !== next.translateProvider
            || (!prev.showTranslation && next.showTranslation);
        if (needReload) {
            loadedVideoId = null;
            loadVideo();
        }
    });

    // YouTube 是單頁應用，換影片時不會重新載入頁面
    document.addEventListener("yt-navigate-finish", () => loadVideo());
    loadVideo();
}

main().catch(e => console.error("[Caption Wordinizer]", e));
