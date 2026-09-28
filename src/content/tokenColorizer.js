// tokenColorizer.js
// 將不同詞性的字幕上色

const POS_COLORS = {
    "名詞": "#4fc3f7",
    "動詞": "#ff8a65",
    "形容詞": "#ffd54f",
    "副詞": "#aed581",
    "助詞": "#b0bec5",
    "助動詞": "#f48fb1",
    "連体詞": "#ce93d8",
    "接続詞": "#80cbc4",
    "感動詞": "#ffab91",
    "接頭詞": "#9fa8da",
    "記号": "#e0e0e0",
    "フィラー": "#bcaaa4",
    "その他": "#ffffff",
};

function colorOf(pos) {
    return POS_COLORS[pos] || POS_COLORS["その他"];
}

function colorizeLines(lines) {
    /*替每個 token 加上 color*/
    return lines.map(line => ({
        ...line,
        tokens: line.tokens.map(t => ({ ...t, color: colorOf(t.pos) })),
    }));
}

export { POS_COLORS, colorOf, colorizeLines };
