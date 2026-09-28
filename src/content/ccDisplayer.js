// ccDisplayer.js
// 將上色後的字幕、詞性名稱、翻譯組裝後，蓋在 YouTube 播放器上顯示
// 也負責：滑鼠停留的提示框、toast、加入單字卡後的預覽卡

import { t, formatTime, videoUrl } from "../common/i18n.js";
import { icon } from "../common/icons.js";

const TOAST_ICONS = {
    loading: "loader-circle",
    success: "check",
    duplicate: "copy",
    warning: "circle-alert",
    error: "circle-alert",
};

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

class CcDisplayer {
    constructor({ onWordClick, onSeek }) {
        this.onWordClick = onWordClick;   // (token, line, translation, tokenEl) => void
        this.onSeek = onSeek;             // (card) => void，由 content.js 決定跳轉或顯示提示
        this.lines = [];
        this.translations = [];
        this.posLabels = new Set();
        this.showTranslation = true;
        this.uiLang = "zh-TW";
        this.currentIndex = -1;
        this.root = null;
        this.video = null;
        this.rafId = null;
        this.toastTimer = null;
        this.card = null;
        this.onDocMouseDown = this.onDocMouseDown.bind(this);
    }

    mount() {
        /*把字幕區塊掛到播放器上，回傳是否成功*/
        const player = document.getElementById("movie_player");
        const video = player && player.querySelector("video");
        if (!player || !video) return false;
        this.video = video;

        if (!this.root || !player.contains(this.root)) {
            this.root = el("div", "cw-overlay");
            this.root.innerHTML = `
                <div class="cw-box">
                    <div class="cw-line"></div>
                    <div class="cw-translation"></div>
                </div>
                <div class="cw-toast" role="status"><span class="cw-toast-icon"></span><span class="cw-toast-text"></span></div>`;
            // 避免點字幕時觸發播放器的暫停/播放
            for (const type of ["click", "mousedown", "mouseup", "dblclick"]) {
                this.root.addEventListener(type, e => e.stopPropagation());
            }
            this.root.querySelector(".cw-line").addEventListener("click", (e) => {
                const tokenEl = e.target.closest(".cw-token");
                if (!tokenEl) return;
                const line = this.lines[this.currentIndex];
                if (!line) return;
                this.onWordClick(line.tokens[Number(tokenEl.dataset.idx)], line,
                    this.translations[this.currentIndex] || "", tokenEl);
            });
            player.appendChild(this.root);
        }
        document.documentElement.classList.add("cw-active");
        document.addEventListener("mousedown", this.onDocMouseDown, true);
        this.startLoop();
        return true;
    }

    unmount() {
        this.stopLoop();
        this.hideCard();
        document.removeEventListener("mousedown", this.onDocMouseDown, true);
        document.documentElement.classList.remove("cw-active");
        if (this.root) this.root.remove();
        this.root = null;
        this.currentIndex = -1;
    }

    setLines(lines) {
        this.lines = lines;
        this.translations = new Array(lines.length).fill("");
        this.currentIndex = -1;
        this.render();
    }

    clearTranslations() {
        this.translations = new Array(this.lines.length).fill("");
        this.renderTranslation();
    }

    setTranslation(index, text) {
        this.translations[index] = text;
        if (index === this.currentIndex) this.renderTranslation();
    }

    setOptions({ posLabels, showTranslation, uiLang }) {
        this.posLabels = new Set(posLabels || []);
        this.showTranslation = showTranslation !== false;
        this.uiLang = uiLang || "zh-TW";
        this.render();
    }

    findIndex(time) {
        /*二分搜尋目前時間對應的字幕*/
        let lo = 0, hi = this.lines.length - 1, found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.lines[mid].start <= time) { found = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        if (found >= 0 && time < this.lines[found].end) return found;
        return -1;
    }

    startLoop() {
        if (this.rafId) return;
        const tick = () => {
            this.rafId = requestAnimationFrame(tick);
            if (!this.video) return;
            const idx = this.findIndex(this.video.currentTime);
            if (idx !== this.currentIndex) {
                this.currentIndex = idx;
                this.hideCard();   // 換句子時關閉預覽卡
                this.render();
            }
        };
        this.rafId = requestAnimationFrame(tick);
    }

    stopLoop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    render() {
        if (!this.root) return;
        const box = this.root.querySelector(".cw-box");
        const lineEl = this.root.querySelector(".cw-line");
        const line = this.lines[this.currentIndex];
        lineEl.textContent = "";
        box.classList.toggle("cw-hidden", !line);
        if (!line) return;

        line.tokens.forEach((token, i) => {
            const span = el("span", "cw-token");
            span.dataset.idx = String(i);
            span.style.color = token.color;
            span.append(
                el("span", "cw-pos", this.posLabels.has(token.pos) ? token.pos : ""),
                el("span", "cw-surface", token.surface),
                this.buildTooltip(token),
            );
            lineEl.appendChild(span);
        });
        this.renderTranslation();
    }

    buildTooltip(token) {
        /*滑鼠停留時顯示：原形 + 原形讀音 / 詞性・細分類 + 出現形讀音 / 提示*/
        const tip = el("span", "cw-tip");
        const head = el("span", "cw-tip-head");
        head.append(el("span", "cw-tip-word", token.basicForm));
        if (token.basicReading && token.basicReading !== token.basicForm) {
            head.append(el("span", "cw-tip-reading", token.basicReading));
        }
        const tags = el("span", "cw-tip-tags");
        tags.append(el("span", "cw-tag cw-tag-accent", token.pos + (token.posDetail ? `・${token.posDetail}` : "")));
        if (token.reading) tags.append(el("span", "cw-tag cw-tag-neutral", t(this.uiLang, "readLabel") + token.reading));
        tip.append(head, tags, el("span", "cw-tip-hint", t(this.uiLang, "tooltipHint")));
        return tip;
    }

    renderTranslation() {
        if (!this.root) return;
        const node = this.root.querySelector(".cw-translation");
        const text = this.showTranslation ? (this.translations[this.currentIndex] || "") : "";
        node.textContent = text;
        node.classList.toggle("cw-hidden", !text);
    }

    toast(message, state = "success") {
        /*state: loading | success | duplicate | warning | error*/
        if (!this.root) return;
        const node = this.root.querySelector(".cw-toast");
        node.dataset.state = state;
        node.querySelector(".cw-toast-icon").innerHTML = icon(TOAST_ICONS[state] || "check", 15);
        node.querySelector(".cw-toast-text").textContent = message;
        node.classList.add("cw-show");
        clearTimeout(this.toastTimer);
        // 載入中的提示會留著，直到被下一個狀態取代
        if (state !== "loading") this.toastTimer = setTimeout(() => this.hideToast(), 2500);
    }

    hideToast() {
        clearTimeout(this.toastTimer);
        if (this.root) this.root.querySelector(".cw-toast").classList.remove("cw-show");
    }

    showCard(card, tokenEl) {
        /*在點擊的單字上方顯示剛加入的單字卡，回傳是否成功顯示*/
        if (!this.root || !tokenEl || !tokenEl.isConnected) return false;
        this.hideCard();
        this.hideToast();
        const lang = this.uiLang;

        const node = el("div", "cw-card");
        node.setAttribute("role", "dialog");
        const body = el("div", "cw-card-body");

        const kicker = el("div", "cw-card-kicker");
        const kickerLabel = el("span", "cw-card-kicker-label");
        kickerLabel.innerHTML = icon("check", 13);
        kickerLabel.append(t(lang, "cardKicker"));
        const close = el("button", "cw-card-close");
        close.type = "button";
        close.title = t(lang, "close");
        close.innerHTML = icon("x", 16);
        close.addEventListener("click", () => this.hideCard());
        kicker.append(kickerLabel, close);

        const head = el("div", "cw-card-head");
        head.append(el("span", "cw-card-word", card.word));
        if (card.reading && card.reading !== card.word) head.append(el("span", "cw-card-reading", card.reading));
        head.append(el("span", "cw-tag cw-tag-accent cw-card-pos", card.pos));

        body.append(kicker, head);
        if (card.meaning) body.append(el("div", "cw-card-meaning", card.meaning));
        if (card.explanation) body.append(el("div", "cw-card-explanation", card.explanation));

        const sentence = el("div", "cw-card-sentence");
        const jp = el("span", "cw-card-jp");
        const hit = card.surface ? card.sentence.indexOf(card.surface) : -1;
        if (hit >= 0) {
            jp.append(card.sentence.slice(0, hit), el("b", null, card.surface), card.sentence.slice(hit + card.surface.length));
        } else {
            jp.textContent = card.sentence;
        }
        sentence.append(jp);
        if (card.sentenceTranslation) sentence.append(el("span", "cw-card-sentence-tr", card.sentenceTranslation));
        body.append(sentence);

        if (card.videoId) {
            const link = el("a", "cw-card-time");
            link.href = videoUrl(card.videoId, card.time);
            link.innerHTML = icon("play", 13);
            link.append(formatTime(card.time));
            link.addEventListener("click", (e) => {
                // Ctrl / Shift / 中鍵點擊維持瀏覽器預設（開新分頁）
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (this.onSeek) this.onSeek(card);
            });
            body.append(link);
        }

        const arrow = el("span", "cw-card-arrow");
        node.append(body, arrow);
        this.root.appendChild(node);
        this.root.classList.add("cw-card-open");

        // 以點擊的單字為中心，限制在播放器範圍內
        const rootRect = this.root.getBoundingClientRect();
        const tokenRect = tokenEl.getBoundingClientRect();
        const playerRect = this.root.parentElement.getBoundingClientRect();
        const width = node.offsetWidth;
        const center = tokenRect.left + tokenRect.width / 2 - rootRect.left;
        const left = Math.min(Math.max(center - width / 2, 8), rootRect.width - width - 8);
        node.style.left = `${left}px`;
        node.style.bottom = `${rootRect.bottom - tokenRect.top + 12}px`;
        arrow.style.left = `${Math.min(Math.max(center - left, 24), width - 24)}px`;
        // 播放器太矮放不下時，內容改為可捲動
        body.style.maxHeight = `${Math.max(tokenRect.top - playerRect.top - 12 - 8, 120)}px`;

        this.card = node;
        return true;
    }

    hideCard() {
        if (this.card) this.card.remove();
        this.card = null;
        if (this.root) this.root.classList.remove("cw-card-open");
    }

    onDocMouseDown(e) {
        // 點預覽卡以外的地方就關閉
        if (this.card && !this.card.contains(e.target)) this.hideCard();
    }
}

export { CcDisplayer };
