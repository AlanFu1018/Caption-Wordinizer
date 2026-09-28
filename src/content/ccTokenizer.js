// ccTokenizer.js
// 用 kuromoji 將所有字幕做詞性切割
// kuromoji.js 由 manifest 的 content_scripts 先載入，會掛在全域的 kuromoji 上
// 斷詞後依「斷詞單位」分組（tokenGrouper），每個顯示單位是單字（word）或文法（grammar）

import { groupTokens } from "./tokenGrouper.js";

let tokenizerPromise = null;

function katakanaToHiragana(str) {
    return (str || "").replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function buildTokenizer() {
    /*kuromoji 內部用 path.join 組網址，會把 chrome-extension:// 壓成 chrome-extension:/
      這裡在載入字典期間暫時修正 XHR 的網址*/
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === "string") url = url.replace(/^chrome-extension:\/(?!\/)/, "chrome-extension://");
        return origOpen.call(this, method, url, ...rest);
    };
    const dicPath = chrome.runtime.getURL("res/lib-vendor/kuromoji/dict/");

    return new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath }).build((err, tokenizer) => {
            XMLHttpRequest.prototype.open = origOpen;
            if (err) reject(err);
            else resolve(tokenizer);
        });
    });
}

function getTokenizer() {
    if (!tokenizerPromise) {
        tokenizerPromise = buildTokenizer().catch(err => {
            tokenizerPromise = null;
            throw err;
        });
    }
    return tokenizerPromise;
}

function readingOf(t) {
    return t.reading && t.reading !== "*" ? katakanaToHiragana(t.reading) : "";
}

function basicReadingOf(tokenizer, basicForm, cache) {
    /*kuromoji 只給出現形的讀音（生き → いき），把原形再斷詞一次取得原形的讀音（生きる → いきる）*/
    if (!cache.has(basicForm)) {
        const parts = tokenizer.tokenize(basicForm);
        cache.set(basicForm, parts.every(p => readingOf(p)) ? parts.map(readingOf).join("") : "");
    }
    return cache.get(basicForm);
}

function normalizeText(text) {
    /*自動字幕有時會把平假名的擬聲詞寫成夾片假名的長音（ぐルーって），kuromoji 會因此斷錯
      （今なんかぐ → 今｜な｜ん｜かぐ）。前面是平假名、後面不是片假名時，把「片假名 1 字 + ー」轉回平假名*/
    return text.replace(/(?<=[ぁ-ゖ])([ァ-ヶ])(ー+)(?![ァ-ヶー])/g, (_, kana, bar) => katakanaToHiragana(kana) + bar);
}

function toToken(group, host, tokenizer, cache) {
    /*一組 kuromoji token（見 tokenGrouper）→ 顯示用的 token*/
    const { tokens: parts, kind, head } = group;
    const surface = parts.map(t => t.surface_form).join("");
    let reading = parts.every(readingOf) ? parts.map(readingOf).join("") : "";
    // 字典裡沒有的詞（擬聲詞等）沒有讀音；整個詞都是假名時，讀音就是它本身
    if (!reading && /^[ぁ-ゖァ-ヶー]+$/.test(surface)) reading = katakanaToHiragana(surface);
    const token = {
        surface,
        kind,
        pos: head.pos,
        posDetail: head.pos_detail_1 !== "*" ? head.pos_detail_1 : "",
        reading,
    };
    if (kind === "grammar") {
        // 文法：以出現的樣子為準（たら、たんだ），記下接在哪個單字後面，給 LLM 當上下文
        token.basicForm = surface;
        token.basicReading = reading;
        token.host = host || "";
        if (parts.length > 1) token.parts = parts.map(t => t.surface_form);
        return token;
    }
    // 後面只接了長音「ー」（ぐる＋ー）時，原形就是整個詞（ぐるー）
    if (parts.slice(1).every(t => /^ー+$/.test(t.surface_form))) {
        const headBasic = head.basic_form && head.basic_form !== "*" ? head.basic_form : head.surface_form;
        if (headBasic === head.surface_form) {
            token.basicForm = surface;
            token.basicReading = reading;
            return token;
        }
    }
    const basicForm = head.basic_form && head.basic_form !== "*" ? head.basic_form : head.surface_form;
    token.basicForm = basicForm;
    token.basicReading = basicForm === head.surface_form ? (readingOf(head) || reading) : basicReadingOf(tokenizer, basicForm, cache);
    return token;
}

async function tokenizeCaptions(captions, { unit = "stem" } = {}) {
    /*captions: [{text, start, end}] → 每句多一個 tokens 陣列；unit 是斷詞單位（word / stem / phrase，見 tokenGrouper）*/
    const tokenizer = await getTokenizer();
    const cache = new Map();
    return captions.map(line => {
        const text = normalizeText(line.text);
        let host = "";
        const tokens = groupTokens(tokenizer.tokenize(text), unit).map(group => {
            const token = toToken(group, host, tokenizer, cache);
            if (token.kind === "word") host = token.basicForm;
            return token;
        });
        return { ...line, text, tokens };
    });
}

export { getTokenizer, tokenizeCaptions, katakanaToHiragana, normalizeText };
