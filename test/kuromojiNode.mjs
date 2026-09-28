// kuromojiNode.mjs
// 在 Node 裡使用擴充功能內附的 kuromoji（瀏覽器版），不需要另外安裝套件。
// 瀏覽器版用 XMLHttpRequest 讀字典，這裡用讀本機檔案的假 XMLHttpRequest 代替。

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "res/lib-vendor/kuromoji");

class FileXMLHttpRequest {
    open(method, url) { this.url = url; }
    send() {
        fs.readFile(this.url, (err, buf) => {
            if (err) { this.status = 404; this.statusText = err.message; this.onerror?.(err); return; }
            this.status = 200;
            this.response = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            this.onload?.();
        });
    }
}

let tokenizerPromise = null;

function getTokenizer() {
    if (!tokenizerPromise) {
        globalThis.XMLHttpRequest ??= FileXMLHttpRequest;
        const kuromoji = createRequire(import.meta.url)(path.join(VENDOR, "kuromoji.js"));
        tokenizerPromise = new Promise((resolve, reject) => {
            kuromoji.builder({ dicPath: path.join(VENDOR, "dict") + "/" })
                .build((err, tokenizer) => err ? reject(err) : resolve(tokenizer));
        });
    }
    return tokenizerPromise;
}

export { getTokenizer, ROOT };
