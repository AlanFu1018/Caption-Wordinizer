// wordcardExporter.js
// 將單字卡匯出成 Anki 可匯入的 TSV 純文字檔
//
// Anki 內建的「基本型」只有正面 / 背面兩個欄位，匯入時依欄位順序對應，
// 所以前兩欄放組合好的 Front（單字）與 Back（分成「讀音 / 解釋 / 例句」三段、字級主次分明的 HTML），
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

function sourceLink(c, style = "") {
    return c.videoId ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}&amp;t=${c.time}s"${style}>YouTube</a>` : "";
}

function examplesHtml(c) {
    return (c.examples || []).map(ex => highlight(ex.sentence, c.word) + (ex.translation ? "<br>" + escapeField(ex.translation) : "")).join("<br><br>");
}

// 背面排版：固定字級（不吃 Anki 預設的 20px），次要文字用透明度變淡，深色 / 淺色模式都能看
const STYLE = {
    wrap: "text-align:left;font-size:16px;line-height:1.6;max-width:34em;margin:0 auto",
    section: "margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,.35)",
    label: "font-size:12px;opacity:.55;letter-spacing:.08em;margin-bottom:2px",
    front: "font-size:34px",
    reading: "font-size:24px",
    meaning: "font-size:19px;font-weight:600",
    pos: "font-size:13px;font-weight:normal;opacity:.65;margin-left:6px;white-space:nowrap",
    explanation: "font-size:14px;opacity:.75;margin-top:4px",
    sentence: "font-size:17px",
    translation: "font-size:14px;opacity:.7",
    example: "margin-top:8px",
    link: "font-size:13px;opacity:.6;margin-top:14px",
    anchor: "color:inherit",
};

const LABELS = {
    "zh-TW": { reading: "讀音", meaning: "解釋", examples: "例句", grammar: "文法" },
    "en": { reading: "Reading", meaning: "Meaning", examples: "Examples", grammar: "Grammar" },
};

const div = (style, html) => `<div style="${style}">${html}</div>`;

function section(label, html, first = false) {
    return div(first ? "" : STYLE.section, div(STYLE.label, label) + html);
}

function exampleBlock(sentenceHtml, translation) {
    return div(STYLE.example, div(STYLE.sentence, sentenceHtml) + (translation ? div(STYLE.translation, escapeField(translation)) : ""));
}

function buildBack(c, labels) {
    /*背面：讀音 / 解釋（意思、詞性、說明） / 例句（影片原句 + 補充例句，各附翻譯） / 影片連結*/
    const sections = [];
    if (c.reading && c.reading !== c.word) sections.push([labels.reading, div(STYLE.reading, escapeField(c.reading))]);

    const posText = c.type === "grammar" ? `${labels.grammar}・${c.pos || ""}` : c.pos;
    const pos = posText ? `<span style="${STYLE.pos}">${escapeField(posText)}</span>` : "";
    let meaning = "";
    if (c.meaning || pos) meaning += div(STYLE.meaning, escapeField(c.meaning) + pos);
    if (c.explanation) meaning += div(STYLE.explanation, escapeField(c.explanation));
    if (meaning) sections.push([labels.meaning, meaning]);

    const examples = [];
    if (c.sentence) examples.push(exampleBlock(highlight(c.sentence, c.surface), c.sentenceTranslation));
    for (const ex of c.examples || []) examples.push(exampleBlock(highlight(ex.sentence, c.word), ex.translation));
    if (examples.length) sections.push([labels.examples, examples.join("")]);

    let html = sections.map(([label, body], i) => section(label, body, i === 0)).join("");
    const link = sourceLink(c, ` style="${STYLE.anchor}"`);
    if (link) html += div(STYLE.link, link);
    return div(STYLE.wrap, html);
}

function toAnkiTsv(cards, lang = "zh-TW") {
    const labels = LABELS[lang] || LABELS["zh-TW"];
    const header = [
        "#separator:tab",
        "#html:true",
        "#columns:Front\tBack\tWord\tReading\tMeaning\tPartOfSpeech\tExplanation\tSentence\tSentenceTranslation\tSource\tExamples",
    ];
    const rows = cards.map(c => [
        // 文法卡前面加「〜」，表示接在其他詞後面
        div(STYLE.front, escapeField(c.type === "grammar" ? `〜${c.word}` : c.word)),
        buildBack(c, labels),
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
