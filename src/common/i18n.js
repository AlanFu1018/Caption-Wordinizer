// i18n.js
// 介面文字（popup、字幕提示、toast、單字卡預覽）。由設定 uiLang 決定語言，和翻譯語言 targetLang 無關。

const STRINGS = {
    "zh-TW": {
        settingsTab: "設定",
        cardsTab: "單字卡",
        enable: "啟用字幕分詞",
        showTranslation: "顯示翻譯",
        sentenceSplit: "重新斷句",
        targetLang: "翻譯語言",
        engine: "翻譯引擎",
        google: "Google 翻譯",
        geminiHead: "Gemini（單字卡 / Gemini 翻譯）",
        model: "模型",
        keyHint: "（只儲存在本機瀏覽器中）",
        posHead: "顯示詞性名稱",
        cardsHint: "點擊影片字幕中的單字即可加入。",
        export: "匯出 Anki (.txt)",
        clear: "全部清除",
        clearConfirm: "確定要刪除所有單字卡嗎？",
        failedCards: "生成失敗單字卡：",
        regenerate: "一鍵補生成",
        regenerating: "補生成中…",
        regenerateDone: "已補生成 {fixed} 張",
        regenerateFailed: "已補生成 {fixed} 張，其餘失敗：{message}",
        delete: "刪除",
        examples: "更多例句",
        readLabel: "読み：",
        tooltipHint: "點一下加入單字卡",
        cardKicker: "已加入單字卡",
        noMeaning: "尚未取得字義，可到設定頁「一鍵補生成」。",
        close: "關閉",
        toastLoading: "正在建立單字卡：{word}…",
        toastSuccess: "已加入單字卡：{word} — {meaning}",
        toastDuplicate: "「{word}」已經在單字卡中",
        toastWarning: "已加入 {word}（未取得字義：{warning}）",
        toastAddFailed: "加入失敗：{message}",
        toastTranslateFailed: "翻譯失敗：{message}",
        toastOtherVideo: "這張單字卡來自另一支影片（{videoId}），無法跳轉",
    },
    "en": {
        settingsTab: "Settings",
        cardsTab: "Wordcards",
        enable: "Enable caption segmentation",
        showTranslation: "Show translation",
        sentenceSplit: "Re-split sentences",
        targetLang: "Target language",
        engine: "Translation engine",
        google: "Google Translate",
        geminiHead: "Gemini (wordcards / translation)",
        model: "Model",
        keyHint: "(stored only in this browser)",
        posHead: "Show part-of-speech names",
        cardsHint: "Click any word in the captions to add it.",
        export: "Export Anki (.txt)",
        clear: "Clear all",
        clearConfirm: "Delete all wordcards?",
        failedCards: "Wordcards missing meaning: ",
        regenerate: "Regenerate all",
        regenerating: "Regenerating…",
        regenerateDone: "Regenerated {fixed}",
        regenerateFailed: "Regenerated {fixed}, the rest failed: {message}",
        delete: "Delete",
        examples: "More examples",
        readLabel: "Reading: ",
        tooltipHint: "Click to add as a wordcard",
        cardKicker: "Added to wordcards",
        noMeaning: "No meaning yet. Use \"Regenerate all\" in Settings.",
        close: "Close",
        toastLoading: "Creating wordcard: {word}…",
        toastSuccess: "Added to wordcards: {word} — {meaning}",
        toastDuplicate: "「{word}」is already in your wordcards",
        toastWarning: "Added {word} (no meaning: {warning})",
        toastAddFailed: "Failed to add: {message}",
        toastTranslateFailed: "Translation failed: {message}",
        toastOtherVideo: "This wordcard is from another video ({videoId}), so it can't jump there",
    },
};

function t(lang, key, vars = {}) {
    const table = STRINGS[lang] || STRINGS["zh-TW"];
    const text = table[key] ?? STRINGS["zh-TW"][key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function videoUrl(videoId, time) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(time || 0)}s`;
}

export { STRINGS, t, formatTime, videoUrl };
