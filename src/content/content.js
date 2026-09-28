console.log("Caption Wordinizer loaded");

function currentVideoId() {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
}

async function main() {
    const load = (path) => import(chrome.runtime.getURL(path));
    const [{ fetchAllCaptions }, { tokenizeCaptions }, { colorizeLines }, { CcDisplayer }, { TranslationScheduler }, settingsLib] =
        await Promise.all([
            load("src/content/ccFetcher.js"),
            load("src/content/ccTokenizer.js"),
            load("src/content/tokenColorizer.js"),
            load("src/content/ccDisplayer.js"),
            load("src/content/translationScheduler.js"),
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

    let scheduler = null;
    let currentLines = null;

    function startTranslation() {
        /*依播放位置分段翻譯（見 translationScheduler.js）*/
        if (scheduler) scheduler.stop();
        scheduler = null;
        displayer.clearTranslations();
        if (!currentLines || !settings.showTranslation || !displayer.video) return;
        scheduler = new TranslationScheduler({
            lines: currentLines,
            video: displayer.video,
            translate: async (texts) => {
                const res = await chrome.runtime.sendMessage({ type: "translate", texts });
                if (!res || !res.ok) throw new Error(res?.error || "unknown error");
                return res.translations;
            },
            onResult: (index, text) => displayer.setTranslation(index, text),
            onError: (message) => displayer.toast(`翻譯失敗：${message}`),
        });
        scheduler.start();
    }

    async function loadVideo() {
        const videoId = currentVideoId();
        if (!settings.enabled || !videoId) {
            session++;
            loadedVideoId = null;
            currentLines = null;
            startTranslation();
            displayer.unmount();
            return;
        }
        if (videoId === loadedVideoId) return;

        const mySession = ++session;
        loadedVideoId = videoId;
        currentLines = null;
        startTranslation();
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
        currentLines = lines;
        startTranslation();
    }

    settingsLib.onSettingsChanged((next) => {
        const prev = settings;
        settings = next;
        displayer.setOptions(settings);
        if (prev.enabled !== next.enabled) {
            loadedVideoId = null;
            loadVideo();
        } else if (prev.targetLang !== next.targetLang
            || prev.translateProvider !== next.translateProvider
            || prev.showTranslation !== next.showTranslation) {
            // 只影響翻譯，不用重新抓字幕
            startTranslation();
        }
    });

    // YouTube 是單頁應用，換影片時不會重新載入頁面
    document.addEventListener("yt-navigate-finish", () => loadVideo());
    loadVideo();
}

main().catch(e => console.error("[Caption Wordinizer]", e));
