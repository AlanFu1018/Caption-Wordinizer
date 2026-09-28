// ccTokenizer.js
// 用 kuromoji 將所有字幕做詞性切割
// kuromoji.js 由 manifest 的 content_scripts 先載入，會掛在全域的 kuromoji 上

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

function toToken(t, tokenizer, cache) {
    const surface = t.surface_form;
    const basicForm = t.basic_form && t.basic_form !== "*" ? t.basic_form : surface;
    const reading = readingOf(t);
    return {
        surface,
        pos: t.pos,
        posDetail: t.pos_detail_1 !== "*" ? t.pos_detail_1 : "",
        basicForm,
        reading,
        basicReading: basicForm === surface ? reading : basicReadingOf(tokenizer, basicForm, cache),
    };
}

async function tokenizeCaptions(captions) {
    /*captions: [{text, start, end}] → 每句多一個 tokens 陣列*/
    const tokenizer = await getTokenizer();
    const cache = new Map();
    return captions.map(line => ({
        ...line,
        tokens: tokenizer.tokenize(line.text).map(t => toToken(t, tokenizer, cache)),
    }));
}

export { getTokenizer, tokenizeCaptions, katakanaToHiragana };
