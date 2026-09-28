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

function toToken(t) {
    return {
        surface: t.surface_form,
        pos: t.pos,
        posDetail: t.pos_detail_1 !== "*" ? t.pos_detail_1 : "",
        basicForm: t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form,
        reading: t.reading && t.reading !== "*" ? katakanaToHiragana(t.reading) : "",
    };
}

async function tokenizeCaptions(captions) {
    /*captions: [{text, start, end}] → 每句多一個 tokens 陣列*/
    const tokenizer = await getTokenizer();
    return captions.map(line => ({
        ...line,
        tokens: tokenizer.tokenize(line.text).map(toToken),
    }));
}

export { getTokenizer, tokenizeCaptions, katakanaToHiragana };
