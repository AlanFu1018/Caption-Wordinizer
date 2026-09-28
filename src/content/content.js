console.log("Caption Wordinizer loaded");

function currentVideoId() {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
}

async function injectFonts() {
    /*YouTube 頁面不一定連得到 Google Fonts，改用擴充功能內附的字型。
      fonts.css 裡是相對路徑，要換成 chrome-extension:// 的完整網址*/
    if (document.getElementById("cw-fonts")) return;
    const base = chrome.runtime.getURL("res/fonts/");
    const css = await (await fetch(base + "fonts.css")).text();
    const style = document.createElement("style");
    style.id = "cw-fonts";
    style.textContent = css.replace(/url\((?!["']?(?:https?:|chrome-extension:|data:))["']?([^)"']+)["']?\)/g, `url(${base}$1)`);
    document.head.appendChild(style);
}

async function main() {
    const load = (path) => import(chrome.runtime.getURL(path));
    const [{ fetchAllCaptions }, { segmentCaptions }, { tokenizeCaptions, getTokenizer },{ colorizeLines }, { CcDisplayer }, { TranslationScheduler }, settingsLib, { t }] =
        await Promise.all([
            load("src/content/ccFetcher.js"),
            load("src/content/ccSegmenter.js"),
            load("src/content/ccTokenizer.js"),
            load("src/content/tokenColorizer.js"),
            load("src/content/ccDisplayer.js"),
            load("src/content/translationScheduler.js"),
            load("src/common/settings.js"),
            load("src/common/i18n.js"),
        ]);
    injectFonts().catch(e => console.warn("[Caption Wordinizer] 字型載入失敗", e));

    let settings = await settingsLib.loadSettings();
    let loadedVideoId = null;
    let session = 0; // 換影片時用來讓舊的非同步工作作廢
    const str = (key, vars) => t(settings.uiLang, key, vars);

    const displayer = new CcDisplayer({
        onSeek: (card) => {
            // 預覽卡的時間連結：用 videoId 判斷是否為目前播放中的影片，是才跳轉，否則顯示提示
            if (card.videoId && card.videoId === currentVideoId() && card.videoId === loadedVideoId && displayer.video) {
                displayer.video.currentTime = card.time;
                return;
            }
            displayer.toast(str("toastOtherVideo", { videoId: card.videoId || "?" }), "warning");
        },
        onWordClick: async (token, line, translation, tokenEl) => {
            displayer.hideCard();
            displayer.toast(str("toastLoading", { word: token.basicForm }), "loading");
            tokenEl.classList.add("cw-picked");
            // 在點擊當下記下 videoId，避免等待回應期間換了影片
            const videoId = loadedVideoId;
            try {
                const res = await chrome.runtime.sendMessage({
                    type: "wordcard:add",
                    token,
                    sentence: line.text,
                    translation,
                    videoId,
                    time: line.start,
                });
                if (!res || !res.ok) throw new Error(res?.error || "unknown error");
                const { card } = res;
                if (res.duplicated) {
                    displayer.toast(str("toastDuplicate", { word: card.word }), "duplicate");
                } else if (res.warning) {
                    displayer.toast(str("toastWarning", { word: card.word, warning: res.warning }), "warning");
                } else if (!displayer.showCard(card, tokenEl)) {
                    // 字幕已換句、找不到點擊的單字時，改用 toast
                    displayer.toast(str("toastSuccess", { word: card.word, meaning: card.meaning }), "success");
                }
            } catch (e) {
                displayer.toast(str("toastAddFailed", { message: e.message }), "error");
            } finally {
                tokenEl.classList.remove("cw-picked");
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
            onError: (message) => displayer.toast(str("toastTranslateFailed", { message }), "error"),
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

        const raw = await fetchAllCaptions(videoId);
        if (mySession !== session || !raw) return;
        // 重新斷句：有標點依標點；沒標點的自動字幕依詞性 + 停頓；沒標點的人工字幕維持原樣
        let captions = raw;
        if (settings.sentenceSplit) {
            const tokenizer = await getTokenizer();
            if (mySession !== session) return;
            captions = segmentCaptions(raw, { tokenize: (text) => tokenizer.tokenize(text) });
        }

        const lines = colorizeLines(await tokenizeCaptions(captions, { unit: settings.tokenUnit }));
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
        if (prev.enabled !== next.enabled || prev.sentenceSplit !== next.sentenceSplit || prev.tokenUnit !== next.tokenUnit) {
            // 斷句方式改變要重新處理字幕
            loadedVideoId = null;
            loadVideo();
        } else if (prev.targetLang !== next.targetLang
            || prev.translateProvider !== next.translateProvider
            || prev.llmProvider !== next.llmProvider
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
