// ccDisplayer.js
// 將上色後的字幕、詞性名稱、翻譯組裝後，蓋在 YouTube 播放器上顯示

class CcDisplayer {
    constructor({ onWordClick }) {
        this.onWordClick = onWordClick;
        this.lines = [];
        this.translations = [];
        this.posLabels = new Set();
        this.showTranslation = true;
        this.currentIndex = -1;
        this.root = null;
        this.video = null;
        this.rafId = null;
        this.toastTimer = null;
    }

    mount() {
        /*把字幕區塊掛到播放器上，回傳是否成功*/
        const player = document.getElementById("movie_player");
        const video = player && player.querySelector("video");
        if (!player || !video) return false;
        this.video = video;

        if (!this.root || !player.contains(this.root)) {
            this.root = document.createElement("div");
            this.root.className = "cw-overlay";
            this.root.innerHTML = `
                <div class="cw-box">
                    <div class="cw-line"></div>
                    <div class="cw-translation"></div>
                </div>
                <div class="cw-toast"></div>`;
            // 避免點字幕時觸發播放器的暫停/播放
            for (const type of ["click", "mousedown", "mouseup", "dblclick"]) {
                this.root.addEventListener(type, e => e.stopPropagation());
            }
            this.root.querySelector(".cw-line").addEventListener("click", (e) => {
                const el = e.target.closest(".cw-token");
                if (!el) return;
                const line = this.lines[this.currentIndex];
                if (!line) return;
                this.onWordClick(line.tokens[Number(el.dataset.idx)], line, this.translations[this.currentIndex] || "");
            });
            player.appendChild(this.root);
        }
        document.documentElement.classList.add("cw-active");
        this.startLoop();
        return true;
    }

    unmount() {
        this.stopLoop();
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

    setOptions({ posLabels, showTranslation }) {
        this.posLabels = new Set(posLabels || []);
        this.showTranslation = showTranslation !== false;
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

        line.tokens.forEach((t, i) => {
            const span = document.createElement("span");
            span.className = "cw-token";
            span.dataset.idx = String(i);
            span.style.color = t.color;
            span.title = [t.pos + (t.posDetail ? `・${t.posDetail}` : ""),
                t.reading && `読み：${t.reading}`,
                t.basicForm !== t.surface && `原形：${t.basicForm}`].filter(Boolean).join("\n");

            const label = document.createElement("span");
            label.className = "cw-pos";
            label.textContent = this.posLabels.has(t.pos) ? t.pos : "";
            const surface = document.createElement("span");
            surface.className = "cw-surface";
            surface.textContent = t.surface;

            span.append(label, surface);
            lineEl.appendChild(span);
        });
        this.renderTranslation();
    }

    renderTranslation() {
        if (!this.root) return;
        const el = this.root.querySelector(".cw-translation");
        const text = this.showTranslation ? (this.translations[this.currentIndex] || "") : "";
        el.textContent = text;
        el.classList.toggle("cw-hidden", !text);
    }

    toast(message) {
        if (!this.root) return;
        const el = this.root.querySelector(".cw-toast");
        el.textContent = message;
        el.classList.add("cw-show");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove("cw-show"), 2500);
    }
}

export { CcDisplayer };
