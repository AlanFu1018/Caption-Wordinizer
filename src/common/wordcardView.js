// wordcardView.js
// 單字卡預覽卡（設計稿 1d）的內容，影片上的預覽卡（ccDisplayer）與 popup 共用
// 樣式在 res/style/style.css 的 .cw-card-*（popup 也會載入這份 CSS）

import { t, formatTime, videoUrl } from "./i18n.js";
import { icon } from "./icons.js";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// 顯示用的單字：文法卡前面加「〜」，表示接在其他詞後面（〜たら、〜たんだ）
function displayWord(card) {
    return card.type === "grammar" ? `〜${card.word}` : card.word;
}

// 句子中的 target 加粗
function buildJp(sentence, target) {
    const jp = el("span", "cw-card-jp");
    const hit = target ? sentence.indexOf(target) : -1;
    if (hit >= 0) {
        jp.append(sentence.slice(0, hit), el("b", null, target), sentence.slice(hit + target.length));
    } else {
        jp.textContent = sentence;
    }
    return jp;
}

/**
 * 建立 .cw-card-body
 * @param {object} card 單字卡
 * @param {object} opts
 * @param {string} opts.lang 介面語言
 * @param {() => void} opts.onClose ✕
 * @param {(card, event) => void} [opts.onTimeClick] 點時間連結；沒給就用瀏覽器預設開連結
 * @param {boolean} [opts.newTab] 時間連結開新分頁
 * @param {(card) => void} [opts.onDelete] 有給才顯示「刪除」
 */
function buildWordcardBody(card, { lang, onClose, onTimeClick, newTab = false, onDelete }) {
    const body = el("div", "cw-card-body");

    const kicker = el("div", "cw-card-kicker");
    const kickerLabel = el("span", "cw-card-kicker-label");
    kickerLabel.innerHTML = icon("check", 13);
    kickerLabel.append(t(lang, "cardKicker"));
    const close = el("button", "cw-card-close");
    close.type = "button";
    close.title = t(lang, "close");
    close.setAttribute("aria-label", t(lang, "close"));
    close.innerHTML = icon("x", 16);
    close.addEventListener("click", onClose);
    kicker.append(kickerLabel, close);

    const head = el("div", "cw-card-head");
    const grammar = card.type === "grammar";
    head.append(el("span", "cw-card-word", displayWord(card)));
    if (card.reading && card.reading !== card.word) head.append(el("span", "cw-card-reading", card.reading));
    head.append(el("span", "cw-tag cw-tag-accent cw-card-pos", grammar ? t(lang, "grammarTag") : card.pos));
    body.append(kicker, head);

    if (card.meaning) body.append(el("div", "cw-card-meaning", card.meaning));
    else body.append(el("div", "cw-card-missing", t(lang, "noMeaning")));
    if (card.explanation) body.append(el("div", "cw-card-explanation", card.explanation));

    const sentence = el("div", "cw-card-sentence");
    sentence.append(buildJp(card.sentence, card.surface));
    if (card.sentenceTranslation) sentence.append(el("span", "cw-card-sentence-tr", card.sentenceTranslation));
    body.append(sentence);

    // 舊的單字卡沒有 examples
    if (card.examples?.length) {
        const examples = el("div", "cw-card-examples");
        examples.append(el("span", "cw-card-examples-label", t(lang, "examples")));
        for (const ex of card.examples) {
            // 例句裡的字可能有變化，只在出現原形時加粗
            const item = el("div", "cw-card-example");
            item.append(buildJp(ex.sentence, card.word));
            if (ex.translation) item.append(el("span", "cw-card-sentence-tr", ex.translation));
            examples.append(item);
        }
        body.append(examples);
    }

    const actions = el("div", "cw-card-actions");
    if (card.videoId) {
        const link = el("a", "cw-card-time");
        link.href = videoUrl(card.videoId, card.time);
        if (newTab) {
            link.target = "_blank";
            link.rel = "noopener";
        }
        link.innerHTML = icon("play", 13);
        link.append(formatTime(card.time));
        if (onTimeClick) {
            link.addEventListener("click", (e) => {
                // Ctrl / Shift / 中鍵點擊維持瀏覽器預設（開新分頁）
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onTimeClick(card, e);
            });
        }
        actions.append(link);
    }
    if (onDelete) {
        const del = el("button", "cw-card-delete");
        del.type = "button";
        del.innerHTML = icon("trash-2", 13);
        del.append(t(lang, "delete"));
        del.addEventListener("click", () => onDelete(card));
        actions.append(del);
    }
    if (actions.childElementCount) body.append(actions);

    return body;
}

export { buildWordcardBody, displayWord };
