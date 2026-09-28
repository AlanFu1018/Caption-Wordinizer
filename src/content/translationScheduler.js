// translationScheduler.js
// 依播放位置分段翻譯：只翻「目前位置往後一段時間」內的字幕，
// 跳轉時新位置優先，避免長影片要等整支翻完。

class TranslationScheduler {
    constructor({ lines, video, translate, onResult, onError,
                  chunkSize = 20, lookaheadSec = 120, maxConcurrent = 2, maxRetries = 1 }) {
        this.lines = lines;
        this.video = video;
        this.translate = translate;         // async (texts) => string[]
        this.onResult = onResult;           // (lineIndex, text) => void
        this.onError = onError;             // (message) => void
        this.chunkSize = chunkSize;
        this.lookaheadSec = lookaheadSec;
        this.maxConcurrent = maxConcurrent;
        this.maxRetries = maxRetries;

        this.state = new Map();             // chunk -> "inflight" | "done" | "failed"
        this.failures = new Map();          // chunk -> 失敗次數
        this.inflight = 0;
        this.stopped = false;
        this.errorReported = false;
        this.pump = this.pump.bind(this);
    }

    start() {
        for (const type of ["timeupdate", "seeking", "play"]) this.video.addEventListener(type, this.pump);
        this.pump();
    }

    stop() {
        this.stopped = true;
        for (const type of ["timeupdate", "seeking", "play"]) this.video.removeEventListener(type, this.pump);
    }

    lineIndexAt(time) {
        /*第一個還沒結束的字幕（二分搜尋）*/
        let lo = 0, hi = this.lines.length - 1, found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.lines[mid].start <= time) { found = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        if (found < 0) return 0;
        return this.lines[found].end > time ? found : found + 1;
    }

    wantedChunks() {
        /*從目前位置所在的區塊開始，到 lookahead 時間內最後一句所在的區塊*/
        const now = this.video.currentTime;
        const first = this.lineIndexAt(now);
        if (first >= this.lines.length) return [];
        let last = this.lineIndexAt(now + this.lookaheadSec);
        last = Math.min(Math.max(last, first), this.lines.length - 1);
        const chunks = [];
        for (let c = Math.floor(first / this.chunkSize); c <= Math.floor(last / this.chunkSize); c++) chunks.push(c);
        return chunks;
    }

    pump() {
        if (this.stopped) return;
        for (const c of this.wantedChunks()) {
            if (this.inflight >= this.maxConcurrent) return;
            if (!this.state.has(c)) this.run(c);
        }
    }

    async run(chunk) {
        this.state.set(chunk, "inflight");
        this.inflight++;
        const start = chunk * this.chunkSize;
        const texts = this.lines.slice(start, start + this.chunkSize).map(l => l.text);
        try {
            const results = await this.translate(texts);
            if (this.stopped) return;
            results.forEach((t, i) => this.onResult(start + i, t));
            this.state.set(chunk, "done");
        } catch (e) {
            if (this.stopped) return;
            const count = (this.failures.get(chunk) || 0) + 1;
            this.failures.set(chunk, count);
            if (count > this.maxRetries) {
                this.state.set(chunk, "failed");
                console.warn("[Caption Wordinizer] 翻譯失敗", e);
                // 同一個錯誤不要一直跳提示
                if (!this.errorReported) this.onError(e.message);
                this.errorReported = true;
            } else {
                this.state.delete(chunk);   // 下次 pump 重試
            }
        } finally {
            this.inflight--;
            if (!this.stopped) this.pump();
        }
    }
}

export { TranslationScheduler };
