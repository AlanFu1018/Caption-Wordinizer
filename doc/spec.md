# 目次 / Table of contents
- [中文說明](#中文)
- [English Description](#english)
---
# 中文
## 這個專案的架構

```bash
caption-wordinizer/
├── manifest.json
├── doc/
│   ├── spec.md
│   └── wait-feat.md
│
├── src/
│   ├── background/
│   │   └── background.js          # service worker，處理翻譯與 LLM 請求
│   │
│   ├── common/
│   │   └── settings.js            # 共用設定（預設值、讀寫、監聽）
│   │
│   ├── content/
│   │   ├── content.js             # content script 進入點，串起所有模組
│   │   ├── ytBridge.js            # 跑在頁面 MAIN world，轉交播放器資料
│   │   ├── ccFetcher.js
│   │   ├── ccTokenizer.js
│   │   ├── tokenColorizer.js
│   │   └── ccDisplayer.js
│   │
│   ├── translate/
│   │   ├── Translator.js
│   │   ├── translatorFactory.js
│   │   └── provider/
│   │       ├── GoogleTranslateProvider.js
│   │       └── GeminiTranslateProvider.js
│   │
│   ├── wordcard/
│   │   ├── WordcardInfoProvider.js
│   │   ├── wordcardInfoFactory.js
│   │   ├── wordcardGenerator.js
│   │   ├── wordcardDB.js
│   │   ├── wordcardExporter.js
│   │   └── provider/
│   │       └── GeminiWordcardProvider.js
│   │
│   └── llmLib/
│       ├── geminiClient.js
│       └── gptClient.js
│
└── res/
    ├── popup/
    │   ├── popup.html
    │   └── popup.js
    ├── style/
    │   └── style.css
    ├── icons/
    │   └── icon128.png
    └── lib-vendor/
        └── kuromoji/              # kuromoji.js 0.1.2 + IPADIC 字典 (Apache-2.0)
```

## 執行流程

```text
[YouTube 頁面 MAIN world]            [content script（隔離環境）]                 [background service worker]
ytBridge ──播放器資料/字幕網址──▶ ccFetcher ─▶ ccTokenizer ─▶ tokenColorizer ─▶ ccDisplayer
                                        │                                         │ 點擊單字
                                        └──── translate (message) ──────────────▶ translatorFactory ─▶ provider
                                                                  wordcard:add ─▶ wordcardGenerator ─▶ wordcardDB
[popup] settings / wordcardDB / wordcardExporter
```

1. `content.js` 在 `/watch` 頁面（包含 YouTube 單頁應用的換頁事件 `yt-navigate-finish`）取得 videoId。
2. `ccFetcher` 透過 `ytBridge` 拿到字幕軌，下載整支影片的日文字幕（json3）。
3. `ccTokenizer` 用 kuromoji 斷詞，`tokenColorizer` 依詞性上色。
4. `ccDisplayer` 把字幕蓋在播放器上（原生字幕會被隱藏），並依影片時間切換句子。
5. 翻譯以每 40 句為一批，從目前播放位置開始送到 background 翻譯。
6. 點擊單字 → background 產生單字卡並存進 `chrome.storage.local`。

## 模組設計
### ytBridge
跑在頁面的 MAIN world（`manifest` 的 `"world": "MAIN"`）。content script 拿不到 `window.ytInitialPlayerResponse`，所以由它讀取 `#movie_player.getPlayerResponse()`，再用 `postMessage` 交給 content script。
它也會攔截播放器自己發出的 `/api/timedtext` 請求網址。YouTube 現在常要求額外的驗證參數（pot），直接用 `baseUrl` 下載可能拿到空白，這時改用播放器的網址下載。
### ccFetcher
一次性抓取該影片所有字幕
- 優先選人工日文字幕，沒有的話用自動產生（asr）字幕。
- 先直接下載 `baseUrl&fmt=json3`；失敗就請 `ytBridge` 開啟播放器字幕，攔截請求網址後再下載。
- 輸出 `[{ text, start, end }]`（秒）。自動字幕的時間區段互相重疊時，截到下一句開始為止。
### ccTokenizer
將所有字幕，處理詞性切割
- 使用 kuromoji（IPADIC），每個 token 為 `{ surface, pos, posDetail, basicForm, reading }`，讀音轉成平假名。
- kuromoji 內部用 `path.join` 組字典網址，會把 `chrome-extension://` 壓成 `chrome-extension:/`，載入字典時會暫時修正 XHR 網址。
### tokenColorizer
將不同詞性的字幕上色（`POS_COLORS`，popup 也用同一份顏色）
### ccDisplayer
將所有部分組裝顯示
- 覆蓋層掛在 `#movie_player` 內，以 `requestAnimationFrame` + 二分搜尋對應目前的句子。
- 每個 token 上方可顯示詞性名稱（依設定的詞性清單），滑鼠停留會顯示讀音與原形，點擊即加入單字卡。
### Translator
將所有字幕整句翻譯（介面：`translateBatch(texts, targetLang) → string[]`）
- `GoogleTranslateProvider`：Google 翻譯公開端點，不需 API Key。多句用換行合併成一次請求，句數對不上時改為逐句翻譯。
- `GeminiTranslateProvider`：將一批句子當作上下文一起送給 Gemini，要求回傳 JSON 陣列。
### translatorFactory
依照設定 `translateProvider`（`google` / `gemini`）選擇具體的翻譯實作
### WordCardInfoProvider
將單字卡的資訊生成（介面：`getInfo(input, targetLang) → { meaning, reading, explanation }`）
### wordcardInfoFactory
選擇具體用哪一個 llm 的實作生成單字卡資訊（目前只有 `gemini`）
### wordcardGenerator
產生完整單字卡：`{ id, word(原形), surface, reading, pos, meaning, explanation, sentence, sentenceTranslation, videoId, time, createdAt }`。LLM 失敗（例如沒有 API Key）時仍會保存基本資料，並回傳警告。
### wordcardDB
保存單字卡（`chrome.storage.local` 的 `wordcards`），以原形去除重複
### wordcardExporter
將單字卡依照anki支援的格式匯出：UTF-8 TSV，帶有 `#separator:tab`、`#html:true`、`#columns:` 標頭，例句中的單字會以粗體標示。
### llmLib
存放llm呼叫的api
- `geminiClient`：Gemini `generateContent`，支援 JSON 輸出。
- `gptClient`：OpenAI Chat Completions（已實作，尚未接上 provider）。
### background
MV3 service worker。所有對外網路請求都在這裡（需要 `host_permissions`），並快取翻譯結果。訊息：`translate`、`wordcard:add`。
### settings / popup
設定存在 `chrome.storage.local` 的 `settings`：啟用、顯示翻譯、翻譯語言（繁體中文 / English）、翻譯引擎、Gemini API Key 與模型、要顯示名稱的詞性。popup 也能瀏覽、刪除、匯出單字卡。

## 完成紀錄
### 2026-09-28 — v0.1 第一版完成
- 完成 spec 中所有模組：字幕抓取、斷詞、上色、顯示、翻譯（Google / Gemini）、單字卡生成 / 保存 / Anki 匯出、popup 設定頁。
- 新增 `ytBridge.js`（MAIN world）、`background.js`、`common/settings.js`，架構圖已同步更新。
- 放入 kuromoji 0.1.2 與字典檔、產生 `icon128.png`。
- 已用 Node 驗證：json3 解析、kuromoji 斷詞與上色、Anki TSV 匯出、Google 翻譯（zh-TW / en）。
- 尚未在 Chrome 實機測試 YouTube 字幕下載流程與 Gemini API（需要 API Key）。

---
# English
## Architecture
See the tree above. On top of the original design, three files were added:
`src/content/ytBridge.js` (page MAIN world bridge), `src/background/background.js` (service worker for network/LLM calls) and `src/common/settings.js` (shared settings).

## Modules
| Module | Role |
|---|---|
| ytBridge | Reads the player response in the page world and captures the player's own `/api/timedtext` URL (it carries YouTube's proof-of-origin token). |
| ccFetcher | Downloads all Japanese captions of a video at once (manual track preferred, ASR fallback) as `[{text, start, end}]`. |
| ccTokenizer | Segments each line with kuromoji (IPADIC); readings converted to hiragana. |
| tokenColorizer | Assigns a color per part of speech. |
| ccDisplayer | Overlay on the player: colored tokens, optional POS labels, translation line, click-to-add wordcard. |
| Translator / translatorFactory | `translateBatch(texts, lang)`; Google Translate (no key) or Gemini. |
| WordcardInfoProvider / wordcardInfoFactory | LLM-generated meaning, reading and explanation (Gemini). |
| wordcardGenerator / wordcardDB | Builds and stores cards in `chrome.storage.local`, de-duplicated by dictionary form. |
| wordcardExporter | Anki-importable TSV with `#separator`, `#html`, `#columns` headers. |
| llmLib | Gemini and OpenAI clients. |

## Changelog
### 2026-09-28 — v0.1
- All modules in the spec implemented; popup settings and wordcard management added.
- Verified in Node: json3 parsing, tokenizing/coloring, Anki export, Google Translate. Not yet tested end-to-end in Chrome.
