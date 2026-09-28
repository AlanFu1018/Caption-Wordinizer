// tokenColorizer.js
// 將不同詞性的字幕上色
// 顏色用 OKLCH 產生，所有色相共用同一個亮度；助詞 / 記号 / フィラー / その他 為中性色

const POS_HUES = {
    "名詞": 235,
    "動詞": 40,
    "形容詞": 85,
    "副詞": 130,
    "助動詞": 5,
    "連体詞": 320,
    "接続詞": 190,
    "感動詞": 60,
    "接頭詞": 275,
};

const NEUTRAL_POS = ["助詞", "記号", "フィラー", "その他"];

function buildPalette(hued, neutral) {
    const palette = {};
    for (const [pos, h] of Object.entries(POS_HUES)) palette[pos] = hued(h);
    for (const pos of NEUTRAL_POS) palette[pos] = neutral;
    return palette;
}

// 深色字幕框上的文字
const POS_COLORS = buildPalette(h => `oklch(0.84 0.1 ${h})`, "oklch(0.86 0.015 75)");
// 米色底上的文字（popup 圓點、單字卡詞性圓圈的字）
const POS_COLORS_LIGHT = buildPalette(h => `oklch(0.47 0.11 ${h})`, "oklch(0.5 0.02 75)");
// 填色（選取中的詞性 chip、單字卡詞性圓圈底色）
const POS_TINTS = buildPalette(h => `oklch(0.93 0.045 ${h})`, "oklch(0.92 0.012 75)");

function colorOf(pos, palette = POS_COLORS) {
    return palette[pos] || palette["その他"];
}

function colorizeLines(lines) {
    /*替每個 token 加上 color*/
    return lines.map(line => ({
        ...line,
        tokens: line.tokens.map(t => ({ ...t, color: colorOf(t.pos) })),
    }));
}

export { POS_COLORS, POS_COLORS_LIGHT, POS_TINTS, colorOf, colorizeLines };
