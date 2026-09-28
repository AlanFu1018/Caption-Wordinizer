// wordcardExporter.js
// 將單字卡匯出成 Anki 可匯入的 TSV 純文字檔
//
// Anki 內建的「基本型」只有正面 / 背面兩個欄位，匯入時依欄位順序對應，
// 所以前兩欄放組合好的 Front（單字）與 Back（讀音、意思、詞性、說明、例句…排版好的 HTML），
// 直接用基本型匯入就能看到全部內容。
// 後面保留各項目的獨立欄位，給想自訂筆記類型的人用（匯入時對應到自己的欄位，不需要的選「無」）：
// 單字 / 讀音 / 意思 / 詞性 / 說明 / 例句 / 例句翻譯 / 影片連結 / 補充例句

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

function sourceLink(c) {
    return c.videoId ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}&amp;t=${c.time}s">YouTube</a>` : "";
}

function examplesHtml(c) {
    return (c.examples || []).map(ex => highlight(ex.sentence, c.word) + (ex.translation ? "<br>" + escapeField(ex.translation) : "")).join("<br><br>");
}

// 背面的次要文字（讀音、翻譯、連結）用灰色小字
const MUTED = 'style="opacity:.7;font-size:.85em"';

function buildBack(c) {
    /*背面：讀音、意思（詞性）、說明、例句 + 翻譯、補充例句、影片連結*/
    const parts = [];
    if (c.reading && c.reading !== c.word) parts.push(`<div style="font-size:1.2em">${escapeField(c.reading)}</div>`);
    const pos = c.pos ? ` <span ${MUTED}>（${escapeField(c.pos)}）</span>` : "";
    if (c.meaning) parts.push(`<div><b>${escapeField(c.meaning)}</b>${pos}</div>`);
    else if (pos) parts.push(`<div>${pos.trim()}</div>`);
    if (c.explanation) parts.push(`<div ${MUTED}>${escapeField(c.explanation)}</div>`);

    const sentence = [];
    if (c.sentence) sentence.push(`<div>${highlight(c.sentence, c.surface)}</div>`);
    if (c.sentenceTranslation) sentence.push(`<div ${MUTED}>${escapeField(c.sentenceTranslation)}</div>`);
    if (sentence.length) parts.push(`<br>${sentence.join("")}`);

    const examples = examplesHtml(c);
    if (examples) parts.push(`<br><div>${examples}</div>`);

    const link = sourceLink(c);
    if (link) parts.push(`<br><div ${MUTED}>${link}</div>`);
    return parts.join("");
}

function toAnkiTsv(cards) {
    const header = [
        "#separator:tab",
        "#html:true",
        "#columns:Front\tBack\tWord\tReading\tMeaning\tPartOfSpeech\tExplanation\tSentence\tSentenceTranslation\tSource\tExamples",
    ];
    const rows = cards.map(c => [
        escapeField(c.word),
        buildBack(c),
        escapeField(c.word),
        escapeField(c.reading),
        escapeField(c.meaning),
        escapeField(c.pos),
        escapeField(c.explanation),
        highlight(c.sentence, c.surface),
        escapeField(c.sentenceTranslation),
        sourceLink(c),
        examplesHtml(c),
    ].join("\t"));
    return [...header, ...rows].join("\n") + "\n";
}

export { toAnkiTsv };
