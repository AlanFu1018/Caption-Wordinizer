// ccSegmenter.js
// 依標點符號重新斷句：YouTube 的字幕行常把一句切成好幾行，或一行塞好幾句。
// 以「。！？」為句尾，把字幕行拆開 / 合併成一句一行；時間依字數比例分配。

// 句尾標點（後面可以接關閉括號 / 引號）
const SENTENCE_END = /[。．！？!?…]+[」』）)】〉》"']*/g;
// 只判斷有沒有句尾標點用（不能用帶 g 的 regex 做 test，lastIndex 會殘留）
const HAS_SENTENCE_END = /[。．！？!?…]/;

const DEFAULTS = {
    maxChars: 42,        // 合併後最多幾個字，超過就在原本的字幕行交界斷開
    maxDuration: 8,      // 合併後最長幾秒
    maxGap: 1.5,         // 兩行之間停頓超過幾秒，視為不同句
    minPunctRatio: 0.2,  // 至少多少比例的字幕行有句尾標點才重新斷句，否則維持原樣
};

function splitLine(line) {
    /*把一行在句尾標點後切開，依字數比例分配時間*/
    const pieces = [];
    let last = 0;
    for (const m of line.text.matchAll(SENTENCE_END)) {
        const endIdx = m.index + m[0].length;
        pieces.push({ from: last, to: endIdx, endsSentence: true });
        last = endIdx;
    }
    if (last < line.text.length) pieces.push({ from: last, to: line.text.length, endsSentence: false });

    const total = line.text.length || 1;
    const duration = line.end - line.start;
    return pieces
        .map(p => ({
            text: line.text.slice(p.from, p.to).trim(),
            start: line.start + duration * (p.from / total),
            end: line.start + duration * (p.to / total),
            endsSentence: p.endsSentence,
        }))
        .filter(p => p.text);
}

function segmentByPunctuation(lines, options = {}) {
    /*lines: [{text, start, end}] → 一句一行的 [{text, start, end}]*/
    const opt = { ...DEFAULTS, ...options };
    if (!lines.length) return lines;

    // 字幕幾乎沒有標點（例如自動字幕）時，重新斷句只會把字幕黏成長串，維持原樣
    const withPunct = lines.filter(l => HAS_SENTENCE_END.test(l.text)).length;
    if (withPunct / lines.length < opt.minPunctRatio) return lines;

    const result = [];
    let cur = null;
    const flush = () => {
        if (cur) result.push({ text: cur.text, start: cur.start, end: cur.end });
        cur = null;
    };

    for (const piece of lines.flatMap(splitLine)) {
        if (cur) {
            const tooLong = cur.text.length + piece.text.length > opt.maxChars;
            const tooSlow = piece.end - cur.start > opt.maxDuration;
            const paused = piece.start - cur.end > opt.maxGap;
            if (tooLong || tooSlow || paused) flush();
        }
        if (!cur) cur = { text: piece.text, start: piece.start, end: piece.end };
        else {
            cur.text += piece.text;
            cur.end = piece.end;
        }
        if (piece.endsSentence) flush();
    }
    flush();
    return result;
}

export { segmentByPunctuation };
