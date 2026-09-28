// wordcardExporter.js
// 將單字卡匯出成 Anki 可匯入的 TSV 純文字檔
// 欄位：正面(單字) / 讀音 / 意思 / 詞性 / 說明 / 例句 / 例句翻譯 / 影片連結

function escapeField(value) {
    // Anki 的 HTML 欄位：跳脫 HTML，換行改成 <br>，tab 換成空白
    return String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\t/g, " ")
        .replace(/\r?\n/g, "<br>");
}

function highlight(sentence, surface) {
    const escaped = escapeField(sentence);
    const target = escapeField(surface);
    return target ? escaped.split(target).join(`<b>${target}</b>`) : escaped;
}

function toAnkiTsv(cards) {
    const header = [
        "#separator:tab",
        "#html:true",
        "#columns:Word\tReading\tMeaning\tPartOfSpeech\tExplanation\tSentence\tSentenceTranslation\tSource",
    ];
    const rows = cards.map(c => [
        escapeField(c.word),
        escapeField(c.reading),
        escapeField(c.meaning),
        escapeField(c.pos),
        escapeField(c.explanation),
        highlight(c.sentence, c.surface),
        escapeField(c.sentenceTranslation),
        c.videoId ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}&amp;t=${c.time}s">${escapeField(c.videoTitle) || "YouTube"}</a>` : "",
    ].join("\t"));
    return [...header, ...rows].join("\n") + "\n";
}

export { toAnkiTsv };
