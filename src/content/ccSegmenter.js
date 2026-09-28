// ccSegmenter.js
// 重新斷句：YouTube 的字幕行常把一句切成好幾行，或一行塞好幾句。
// 先把所有字幕行接成一條「字元串流」（每個字元都有時間），再在串流上選斷點：
//   - 字幕有足夠的句尾標點 → 在「。！？」後斷（segmentByPunctuation）
//   - 標點不足的自動字幕 → 用 kuromoji 的詞性 / 活用形 + 說話停頓判斷句尾（segmentByPos）
//   - 標點不足的人工字幕 → 維持原樣
// 自動字幕有逐詞時間（ccFetcher 的 words），時間會精確到詞；沒有的話依字數比例分配。
// 參數是用 test/segmenter-eval.mjs 在真實字幕上調出來的，修改規則後請重跑評估。

// 句尾標點（後面可以接關閉括號 / 引號）
const SENTENCE_END = /[。．！？!?…]+[」』）)】〉》"']*/g;
// 只判斷有沒有句尾標點用（不能用帶 g 的 regex 做 test，lastIndex 會殘留）
const HAS_SENTENCE_END = /[。．！？!?…]/;

const DEFAULTS = {
    maxChars: 42,        // 一句最多幾個字，超過就在最適合的位置斷開
    maxDuration: 8,      // 一句最長幾秒
    minPunctRatio: 0.2,  // 有句尾標點的行達到這個比例才用標點斷句
    // ── 詞性斷句 ──
    minChars: 4,         // 詞性斷句時一句至少幾個字（避免切出很碎的片段）
    threshold: 3,        // 分數達到這個值就斷開
    hardPause: 1.5,      // 停頓超過幾秒一定斷開
    lineBonus: 2,        // 人工字幕（沒有逐詞時間）的行交界加分
    posRules: true,      // false = 不用詞性加分，只看停頓（評估比較用）
};

// ── 字元串流 ──

function buildStream(lines) {
    /*把字幕行接成一條串流：
      text      所有字幕接起來的文字
      start[i]  第 i 個字元開始的時間；end[i] 結束的時間
      pause[i]  位置 i（第 i 個字元之前）的停頓秒數，只在詞 / 行的交界有值
      lineEnd   每行結束的位置（行交界）
      timedByWord 這個位置的時間來自逐詞時間*/
    let text = "";
    const start = [], end = [], pause = new Map(), lineEnd = new Set();
    let prevEnd = null;

    for (const line of lines) {
        const base = text.length;
        text += line.text;
        const n = line.text.length;
        if (line.words) {
            // 每個詞的字元平均分配在「這個詞開始 ~ 下一個詞開始」之間
            let pos = 0;
            line.words.forEach((w, k) => {
                const wStart = w.start;
                const wEnd = k + 1 < line.words.length ? line.words[k + 1].start : Math.max(line.end, wStart);
                const len = w.text.length;
                for (let c = 0; c < len; c++) {
                    start[base + pos + c] = wStart + (wEnd - wStart) * (c / len);
                    end[base + pos + c] = wStart + (wEnd - wStart) * ((c + 1) / len);
                }
                if (k > 0) {
                    // 詞與詞的停頓：下一個詞的開始 - 這個詞開始 - 估計的發音時間（每字約 0.13 秒）
                    const prev = line.words[k - 1];
                    pause.set(base + pos, Math.max(0, wStart - prev.start - prev.text.length * 0.13));
                }
                pos += len;
            });
        } else {
            const dur = line.end - line.start;
            for (let c = 0; c < n; c++) {
                start[base + c] = line.start + dur * (c / n);
                end[base + c] = line.start + dur * ((c + 1) / n);
            }
        }
        if (base > 0) {
            lineEnd.add(base);
            if (prevEnd != null) pause.set(base, Math.max(pause.get(base) || 0, line.start - prevEnd));
        }
        prevEnd = line.end;
    }
    return { text, start, end, pause, lineEnd, byWord: lines.some(l => l.words) };
}

function toLines(stream, cuts) {
    /*依斷點（字元位置，遞增、最後一個是 text.length）輸出 [{text, start, end}]*/
    const out = [];
    let from = 0;
    for (const to of cuts) {
        // 去掉頭尾空白，時間跟著調整
        let a = from, b = to;
        while (a < b && /\s/.test(stream.text[a])) a++;
        while (b > a && /\s/.test(stream.text[b - 1])) b--;
        if (b > a) out.push({ text: stream.text.slice(a, b), start: stream.start[a], end: stream.end[b - 1] });
        from = to;
    }
    return out;
}

function selectCuts(stream, candidates, opt) {
    /*candidates: Map(位置 → { score, hard })。從左到右掃：
      - hard 或分數 ≥ threshold（且長度 ≥ minChars）就斷
      - 超過 maxChars / maxDuration 時，斷在目前這段裡分數最高的候選位置（同分取後面的）*/
    const n = stream.text.length;
    const positions = [...candidates.keys()].filter(p => p > 0 && p < n).sort((a, b) => a - b);
    const cuts = [];
    let segStart = 0, best = null;

    for (const p of positions) {
        const c = candidates.get(p);
        const len = p - segStart;
        const dur = stream.end[p - 1] - stream.start[segStart];
        const tooLong = len > opt.maxChars || dur > opt.maxDuration;

        if (tooLong && best) {
            cuts.push(best.pos);
            segStart = best.pos;
            best = null;
            // 斷完之後，這個位置要以新的一段重新判斷
            if (p - segStart <= 0) continue;
        }
        const newLen = p - segStart;
        if (c.hard || (c.score >= opt.threshold && newLen >= opt.minChars)) {
            cuts.push(p);
            segStart = p;
            best = null;
            continue;
        }
        if (newLen >= opt.minChars && (!best || c.score >= best.score)) best = { pos: p, score: c.score };
    }
    cuts.push(n);
    return cuts;
}

// ── 標點斷句 ──

function punctuationCandidates(stream) {
    const candidates = new Map();
    // 句尾標點之後：一定斷
    for (const m of stream.text.matchAll(SENTENCE_END)) {
        candidates.set(m.index + m[0].length, { score: 10, hard: true });
    }
    // 行交界：只在一句太長時當作備用斷點（沒有逐詞時間時才有意義；有逐詞時間時行交界是隨機的）
    for (const p of stream.lineEnd) {
        if (!candidates.has(p)) candidates.set(p, { score: stream.byWord ? 0 : 1, hard: false });
    }
    return candidates;
}

function segmentByPunctuation(lines, options = {}) {
    /*lines: [{text, start, end, words?}] → 一句一行的 [{text, start, end}]*/
    const opt = { ...DEFAULTS, ...options, minChars: 1, threshold: Infinity };
    if (!lines.length) return lines;
    const stream = buildStream(lines);
    return toLines(stream, selectCuts(stream, punctuationCandidates(stream), opt));
}

// ── 詞性斷句 ──

// 句尾常見的助動詞（基本形）；ん = ありませ「ん」，じゃん = 口語句尾
const FINAL_AUX = new Set(["ます", "です", "た", "だ", "う", "よう", "まい", "ん", "じゃん"]);
// 後面一定還有下文的助詞：格助詞、係助詞、副助詞、並立助詞、「の」（連体化）、「て」
const BINDING_PARTICLE = new Set(["格助詞", "係助詞", "副助詞", "並立助詞", "連体化", "副助詞／並立助詞／終助詞"]);

function isSentenceInitialDewa(tokens, k) {
    /*kuromoji 常把句首的「では」「じゃあ」拆成助動詞「で」「じゃ」+ …，其實是接續詞*/
    const t = tokens[k];
    return t.pos === "助動詞" && (t.surface_form === "で" || t.surface_form === "じゃ")
        && tokens[k + 1] && tokens[k + 1].pos === "助詞" && tokens[k + 1].surface_form === "は";
}

function posScore(tokens, k) {
    /*tokens[k-1]、tokens[k] 之間斷開的分數；-Infinity 代表不能斷*/
    const prev = tokens[k - 1], next = tokens[k];
    const dewa = isSentenceInitialDewa(tokens, k);

    // 下一個是附屬語（助詞、助動詞）、接尾詞或非自立語（方、こと、いる…），一定和前面連在一起
    if ((next.pos === "助詞" || next.pos === "助動詞") && !dewa) return -Infinity;
    if (next.pos_detail_1 === "接尾" || next.pos_detail_1 === "非自立") return -Infinity;
    if (next.pos === "記号") return -Infinity;
    // 前一個是接頭詞、會接下文的助詞、或是活用到一半（連用形、未然形…），後面一定還有
    if (prev.pos === "接頭詞") return -Infinity;
    if (prev.pos === "助詞" && (BINDING_PARTICLE.has(prev.pos_detail_1) || prev.pos_detail_1 === "接続助詞")) return -Infinity;
    const form = prev.conjugated_form;
    const imperative = form && form.startsWith("命令");
    if (form && form !== "*" && form !== "基本形" && !imperative) return -Infinity;

    let score = 0;
    if (prev.pos === "助詞" && prev.pos_detail_1 === "終助詞") score += 3;
    else if (prev.pos === "助動詞" && FINAL_AUX.has(prev.basic_form)) score += 3;
    else if (imperative) score += 3;                                   // しなさい、してください
    else if (prev.pos === "感動詞") score += 3;                         // こんにちは、お疲れ様
    else if (prev.pos === "助動詞") score += 1;                        // ない、たい… 可能是句尾也可能修飾名詞
    else if (prev.pos === "動詞" || prev.pos === "形容詞") score += 1; // 基本形 = 連體形，不確定

    // 下一個是新句子常見的開頭
    if (dewa || next.pos === "接続詞") score += 2;
    else if (next.pos === "連体詞" && score > 0) score += 2;          // 痛い｜そんな時…（連體形不會直接接連體詞）
    else if (next.pos === "感動詞" || next.pos === "フィラー") score += 1;
    return score;
}

function posCandidates(stream, tokenize, opt) {
    const candidates = new Map();
    const tokens = tokenize(stream.text);
    for (let k = 1; k < tokens.length; k++) {
        const pos = tokens[k].word_position - 1;   // kuromoji 的 word_position 從 1 開始
        let score = posScore(tokens, k);
        if (!opt.posRules && score !== -Infinity) score = 0;
        const pause = stream.pause.get(pos) || 0;
        if (pause > opt.hardPause) {
            candidates.set(pos, { score: 10, hard: true });
            continue;
        }
        if (score === -Infinity) continue;
        if (pause > 0.8) score += 3;
        else if (pause > 0.4) score += 1.5;
        // 人工字幕的行交界通常是意思的段落
        if (stream.lineEnd.has(pos) && !stream.byWord) score += opt.lineBonus;
        candidates.set(pos, { score, hard: false });
    }
    return candidates;
}

function posCuts(lines, tokenize, options = {}) {
    /*詞性斷句的斷點（字元位置），評估腳本也會直接用*/
    const opt = { ...DEFAULTS, ...options };
    const stream = buildStream(lines);
    return { stream, cuts: selectCuts(stream, posCandidates(stream, tokenize, opt), opt) };
}

function segmentByPos(lines, tokenize, options = {}) {
    /*沒有標點時用詞性斷句；tokenize(text) 回傳 kuromoji 的 token 陣列*/
    if (!lines.length) return lines;
    const { stream, cuts } = posCuts(lines, tokenize, options);
    return toLines(stream, cuts);
}

// ── 入口 ──

function segmentCaptions(lines, { tokenize, ...options } = {}) {
    /*依字幕選擇斷句方式：
      1. 有足夠的句尾標點 → 標點斷句
      2. 沒有標點、但有逐詞時間（自動字幕）→ 詞性斷句
      3. 其他（沒有標點的人工字幕）→ 維持原樣。人工字幕的斷行本身就是很好的斷點，
         用 test/segmenter-eval.mjs 評估時，詞性斷句並沒有比原本的斷行好*/
    const opt = { ...DEFAULTS, ...options };
    if (!lines.length) return lines;
    const withPunct = lines.filter(l => HAS_SENTENCE_END.test(l.text)).length;
    if (withPunct / lines.length >= opt.minPunctRatio) return segmentByPunctuation(lines, options);
    const byWord = lines.filter(l => l.words).length / lines.length >= 0.5;
    if (tokenize && byWord) return segmentByPos(lines, tokenize, options);
    return lines.map(({ text, start, end }) => ({ text, start, end }));
}

export { segmentCaptions, segmentByPunctuation, segmentByPos, posCuts, buildStream, DEFAULTS };
