// segmenter-eval.mjs
// 評估詞性斷句：把有標點的字幕拿掉句尾標點，看斷句能不能找回原本「。！？」的位置。
// 文字完全相同，所以可以逐字比對，不受時間誤差影響。
// 「可接受」= 斷在原本句尾或逗號的比例（斷在逗號不是句尾，但讀起來還算自然）。
//
// 用法：node test/segmenter-eval.mjs [fixtures 目錄]
// fixtures：YouTube 的 json3 字幕檔（*.asr.*.json3 = 自動字幕，*.manual.*.json3 = 人工字幕），
// 可用 yt-dlp 下載：
//   yt-dlp --skip-download --write-subs --sub-langs ja --sub-format json3 -o "%(id)s.manual.%(ext)s" URL
//   yt-dlp --skip-download --write-auto-subs --sub-langs ja-orig --sub-format json3 -o "%(id)s.asr.%(ext)s" URL

import fs from "fs";
import path from "path";
import { getTokenizer, ROOT } from "./kuromojiNode.mjs";

globalThis.location ??= { origin: "https://www.youtube.com" };
const { parseJson3 } = await import(new URL("../src/content/ccFetcher.js", import.meta.url));
const { posCuts, buildStream } = await import(new URL("../src/content/ccSegmenter.js", import.meta.url));

const PUNCT = /[。．！？!?…]/;          // 句尾標點：標準答案
const COMMA = /[、，,]/;                  // 逗號：沒有句尾標點的字幕通常也沒有逗號，一起拿掉
const TOLERANCE = 1;   // 斷點差幾個字以內算對

function stripPunctuation(lines) {
    /*拿掉句尾標點，回傳 { lines, gold }；gold 是原本句尾標點的位置（在去標點後的串流中）*/
    const out = [];
    const gold = new Set();
    const commas = new Set();   // 原本逗號的位置：斷在這裡不算句尾，但讀起來還算自然
    let offset = 0;
    for (const line of lines) {
        let text = "";
        for (const ch of line.text) {
            if (PUNCT.test(ch)) gold.add(offset + text.length);
            else if (COMMA.test(ch)) commas.add(offset + text.length);
            else text += ch;
        }
        if (!text) continue;
        const stripped = { text, start: line.start, end: line.end };
        if (line.words) {
            const words = line.words
                .map(w => ({ ...w, text: [...w.text].filter(ch => !PUNCT.test(ch) && !COMMA.test(ch)).join("") }))
                .filter(w => w.text);
            if (words.map(w => w.text).join("") === text) stripped.words = words;
        }
        out.push(stripped);
        offset += text.length;
    }
    gold.delete(0);
    gold.delete(offset);
    return { lines: out, gold, commas, length: offset };
}

function score(pred, gold, commas) {
    const matchedGold = new Set();
    let tp = 0;
    for (const p of pred) {
        for (let d = 0; d <= TOLERANCE; d++) {
            const hit = [p - d, p + d].find(g => gold.has(g) && !matchedGold.has(g));
            if (hit != null) { matchedGold.add(hit); tp++; break; }
        }
    }
    const precision = pred.length ? tp / pred.length : 0;
    // 可接受率：斷在句尾或逗號（±1 字）的比例
    const near = (set, p) => [p - 1, p, p + 1].some(x => set.has(x));
    const acceptable = pred.length ? pred.filter(p => near(gold, p) || near(commas, p)).length / pred.length : 0;
    const recall = gold.size ? matchedGold.size / gold.size : 0;
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    return { precision, recall, f1, acceptable };
}

function segLengths(cuts) {
    const lens = [];
    let from = 0;
    for (const c of cuts) { lens.push(c - from); from = c; }
    return { avg: lens.reduce((a, b) => a + b, 0) / lens.length, max: Math.max(...lens) };
}

const pct = (x) => (x * 100).toFixed(1).padStart(5) + "%";

async function main() {
    const dir = process.argv[2] || path.join(ROOT, "test/fixtures");
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json3")).sort();
    if (!files.length) {
        console.log(`找不到字幕檔：${dir}（下載方式見檔案開頭）`);
        return;
    }
    const tokenizer = await getTokenizer();
    const tokenize = (text) => tokenizer.tokenize(text);

    const methods = {
        "原本的斷行": (lines) => {
            const stream = buildStream(lines);
            return [...stream.lineEnd].sort((a, b) => a - b).concat(stream.text.length);
        },
        "只看停頓": (lines) => posCuts(lines, tokenize, { posRules: false }).cuts,
        "詞性＋停頓": (lines) => posCuts(lines, tokenize).cuts,
    };

    const totals = {};
    for (const file of files) {
        const kind = file.includes(".asr.") ? "自動" : "人工";
        const raw = parseJson3(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
        const { lines, gold, commas, length } = stripPunctuation(raw);
        console.log(`\n${file}（${kind}字幕，${length} 字，${gold.size} 個句尾）`);
        for (const [name, run] of Object.entries(methods)) {
            const cuts = run(lines);
            const pred = cuts.slice(0, -1);
            const s = score(pred, gold, commas);
            const { avg, max } = segLengths(cuts);
            console.log(`  ${name.padEnd(6, "　")} 精確率 ${pct(s.precision)}  召回率 ${pct(s.recall)}  F1 ${pct(s.f1)}  可接受 ${pct(s.acceptable)}  平均 ${avg.toFixed(1)} 字 / 最長 ${max} 字`);
            const key = `${kind}|${name}`;
            totals[key] ??= { precision: 0, recall: 0, f1: 0, acceptable: 0, n: 0 };
            for (const k of ["precision", "recall", "f1", "acceptable"]) totals[key][k] += s[k];
            totals[key].n++;
        }
    }

    console.log("\n── 平均 ──");
    for (const [key, t] of Object.entries(totals)) {
        const [kind, name] = key.split("|");
        console.log(`  ${kind}字幕 ${name.padEnd(6, "　")} 精確率 ${pct(t.precision / t.n)}  召回率 ${pct(t.recall / t.n)}  F1 ${pct(t.f1 / t.n)}  可接受 ${pct(t.acceptable / t.n)}`);
    }
}

main();
