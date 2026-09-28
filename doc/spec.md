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
│   │   ├── settings.js            # 共用設定（預設值、讀寫、監聽），存在 storage.sync
│   │   ├── secrets.js             # API Key 讀寫，只給 background / popup 用
│   │   ├── i18n.js                # 介面文字（zh-TW / en）、時間格式、影片連結
│   │   ├── icons.js               # Lucide 圖示（inline SVG）
│   │   └── wordcardView.js        # 預覽卡（1d）內容，影片上與 popup 共用
│   │
│   ├── content/
│   │   ├── content.js             # content script 進入點，串起所有模組
│   │   ├── ytBridge.js            # 跑在頁面 MAIN world，轉交播放器資料
│   │   ├── ccFetcher.js
│   │   ├── ccTokenizer.js
│   │   ├── tokenColorizer.js
│   │   ├── ccDisplayer.js
│   │   └── translationScheduler.js    # 依播放位置分段翻譯
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
    │   ├── popup.css
    │   └── popup.js
    ├── style/
    │   └── style.css              # 字幕覆蓋層、提示框、toast、單字卡預覽
    ├── fonts/                     # Caprasimo / Figtree / Huninn / Zen Maru Gothic (OFL)，fonts.css + woff2 子集
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
5. `translationScheduler` 依播放位置分段翻譯：只翻目前位置往後約 2 分鐘的字幕，跳轉時新位置優先。
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
- 刪除方括號標籤（`[音楽]`、`[拍手]`、`［笑い］` 等，半形 `[]` 與全形 `［］`），並清掉多餘空白；整句只有標籤時整句略過。方括號裡的內容一律刪除，所以字幕若真的有 `[…]` 文字也會被移除。
### ccTokenizer
將所有字幕，處理詞性切割
- 使用 kuromoji（IPADIC），每個 token 為 `{ surface, pos, posDetail, basicForm, reading, basicReading }`，讀音轉成平假名。
- `reading` 是出現形的讀音（生き → いき）；`basicReading` 是把原形再斷詞一次得到的原形讀音（生きる → いきる），用於提示框與單字卡。
- kuromoji 內部用 `path.join` 組字典網址，會把 `chrome-extension://` 壓成 `chrome-extension:/`，載入字典時會暫時修正 XHR 網址。
### tokenColorizer
將不同詞性的字幕上色。顏色以 OKLCH 產生（各詞性共用同一亮度，助詞 / 記号 / フィラー / その他 為中性色），分三組：
- `POS_COLORS`：深色字幕框上的文字
- `POS_COLORS_LIGHT`：米色底上的文字（popup 圓點、單字卡詞性圓圈）
- `POS_TINTS`：填色（選取中的詞性 chip、單字卡詞性圓圈底色）
### ccDisplayer
將所有部分組裝顯示
- 覆蓋層掛在 `#movie_player` 內，以 `requestAnimationFrame` + 二分搜尋對應目前的句子。
- 每個 token 上方可顯示詞性名稱（依設定的詞性清單），點擊即加入單字卡。
- 提示框（取代原本的 `title`）：原形 + 原形讀音、`詞性・細分類` 與出現形讀音標籤、「點一下加入單字卡」。
- `toast(message, state)`：state 為 `loading` / `success` / `duplicate` / `warning` / `error`，各有圖示與顏色；loading 會留著直到被取代，其他 2.5 秒後消失。建立期間點擊的單字保持反白。
- `showCard(card, tokenEl)`：加入成功後在單字上方顯示預覽卡（意思、說明、例句、時間連結），以單字為中心並限制在播放器內；播放器太矮時內容可捲動。按 ✕、點外面或換句子時關閉。
- 預覽卡的時間連結：卡片的 `videoId` 等於目前播放中的影片時，直接跳到該句（不重新載入頁面）；是不同影片時不跳轉，改顯示提示「這張單字卡來自另一支影片（{videoId}），無法跳轉」。Ctrl / Shift / 中鍵點擊仍可開新分頁。
- 重複、警告、錯誤仍使用 toast；字幕已換句找不到點擊的單字時，成功也改用 toast。
### translationScheduler
依播放位置分段翻譯，解決長影片（20 分鐘以上）要等很久才有翻譯的問題
- 字幕每 20 句為一段（chunk），只翻「目前位置 ~ 往後 120 秒」涵蓋的段落，沒看到的部分不會翻。
- 監聽影片的 `timeupdate` / `seeking` / `play`，播放前進時自動補下一段；跳轉時從新位置所在的段落開始。
- 同時最多 2 個請求，失敗會重試 1 次，仍失敗才顯示一次錯誤提示。
- 切換翻譯語言、翻譯引擎或開關翻譯時，只重新開始翻譯，不重新抓字幕；已翻過的句子由 background 的快取直接回傳。
### Translator
將所有字幕整句翻譯（介面：`translateBatch(texts, targetLang) → string[]`）
- `GoogleTranslateProvider`：Google 翻譯公開端點，不需 API Key。多句用換行合併成一次請求，句數對不上時改為逐句翻譯。
- `GeminiTranslateProvider`：將一批句子當作上下文一起送給 Gemini，要求回傳 JSON 陣列。
### translatorFactory
依照設定 `translateProvider`（`google` / `gemini`）選擇具體的翻譯實作
### WordCardInfoProvider
將單字卡的資訊生成（介面：`getInfo(input, targetLang) → { meaning, reading, explanation, examples }`，`examples` 為 LLM 補充的 2 句例句 `[{ sentence, translation }]`）
### wordcardInfoFactory
選擇具體用哪一個 llm 的實作生成單字卡資訊（目前只有 `gemini`）
### wordcardGenerator
產生完整單字卡：`{ id, word(原形), surface, reading, pos, meaning, explanation, examples, sentence, sentenceTranslation, videoId, time, createdAt }`。影片只以 `videoId` 辨識，在點擊單字當下記錄（等待回應期間換了影片也不會記錯）。LLM 失敗（例如沒有 API Key）時仍會保存基本資料，並回傳警告。
### wordcardDB
保存單字卡（`chrome.storage.local` 的 `wordcards`），以原形去除重複
### wordcardExporter
將單字卡依照anki支援的格式匯出：UTF-8 TSV，帶有 `#separator:tab`、`#html:true`、`#columns:` 標頭，例句中的單字會以粗體標示。
### llmLib
存放llm呼叫的api
- `geminiClient`：Gemini `generateContent`，支援 JSON 輸出。
- `gptClient`：OpenAI Chat Completions（已實作，尚未接上 provider）。
### background
MV3 service worker。所有對外網路請求都在這裡（需要 `host_permissions`），並快取翻譯結果。訊息：`translate`、`wordcard:add`、`wordcard:regenerate`（把沒有 `meaning` 的單字卡逐張重跑 LLM，遇到錯誤就停止，回傳 `{ fixed, error? }`）。
### settings / popup
一般設定存在 `chrome.storage.sync` 的 `settings`：啟用、介面語言 `uiLang`（`zh-TW` / `en`，和翻譯語言無關）、顯示翻譯、翻譯語言（繁體中文 / English）、翻譯引擎、Gemini 模型（預設 `gemini-3.1-flash-lite`）、要顯示名稱的詞性。
popup 分兩個分頁（會記住上次的分頁）：
- 設定：header 有介面語言切換（中 / EN）與啟用開關；翻譯語言、翻譯引擎用分段按鈕；詞性用可點選的 chip。
- 單字卡：頂端顯示生成失敗（沒有字義）的單字卡數量與「一鍵補生成」按鈕；最新的在最上面，每張顯示詞性、單字、讀音、意思。**點卡片會跳出完整預覽卡**（和影片上的 1d 同一個樣式，由 `wordcardView.js` 產生）：單字、讀音、詞性、完整意思、說明、例句、例句翻譯、時間連結（開新分頁）與刪除。還沒取得字義的卡片會提示到設定頁補生成。按 ✕、點背景或 Esc 關閉；補生成更新了這張卡時會即時更新內容。底部為匯出與全部清除。
- popup 也載入 `res/style/style.css` 取得預覽卡的樣式（`.cw-card` 上有自己的色彩變數，不依賴 `.cw-overlay`）。
### UI 設計（Organic）
依 `doc/UI mockups form/design_handoff_caption_wordinizer_organic/README.md` 實作，採用的版本為 1a（字幕 + 提示框）、1c（toast）、1d（單字卡預覽）、2a（設定分頁）、1h（單字卡分頁）。
- 顏色：米色 `#f5ead8` 底、陶土色 `#c67139` 強調色、鼠尾草綠 `#7a8a5e` 表示成功。
- 字型：Caprasimo（標題）、Figtree（內文）、Huninn（中文）、Zen Maru Gothic（日文）。全部內附於 `res/fonts/`，popup 直接引用 `fonts.css`；content script 讀取 `fonts.css` 後把相對路徑換成 `chrome-extension://` 網址，再注入 YouTube 頁面。
- 圖示：Lucide（`src/common/icons.js`）。
- 和設計稿不同處：模型欄位預設值維持 `gemini-3.1-flash-lite`（設計稿寫 `gemini-2.5-flash`）；預覽卡在播放器太矮時改為可捲動。
### secrets（API Key 的保存）
- Gemini API Key 單獨存在 `chrome.storage.local` 的 `geminiApiKey`，不和一般設定放在一起。
- background 每次啟動都會呼叫 `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`，讓 `local`（API Key、單字卡）只有 background 與 popup 讀得到，content script 讀不到。
- API Key 只在 background 中和設定合併，用來呼叫 Gemini，不會傳給 content script。
- 限制：`storage.local` 在磁碟上沒有加密，能讀取 Chrome 設定檔的人仍可取得。建議在 Google Cloud Console 限制這把 Key 只能用 Gemini API，並設定用量上限。
- v0.1 的舊設定（全部存在 `local` 的 `settings`）會在 background 啟動時自動拆開搬移。

## 完成紀錄
### 2026-09-28 — v0.1 第一版完成
- 完成 spec 中所有模組：字幕抓取、斷詞、上色、顯示、翻譯（Google / Gemini）、單字卡生成 / 保存 / Anki 匯出、popup 設定頁。
- 新增 `ytBridge.js`（MAIN world）、`background.js`、`common/settings.js`，架構圖已同步更新。
- 放入 kuromoji 0.1.2 與字典檔、產生 `icon128.png`。
- 已用 Node 驗證：json3 解析、kuromoji 斷詞與上色、Anki TSV 匯出、Google 翻譯（zh-TW / en）。
- 尚未在 Chrome 實機測試 YouTube 字幕下載流程與 Gemini API（需要 API Key）。

### 2026-09-28 — API Key 保存方式改善
- API Key 從 `settings` 拆出，存到 `secrets.js` 管理的 `local.geminiApiKey`，並把 `storage.local` 限制為只有擴充功能頁面能讀取；一般設定改存 `storage.sync`。
- 預設模型改為 `gemini-3.1-flash-lite`；舊版存下的 `gemini-2.5-flash` 會在搬移時改回預設值。

### 2026-09-28 — 長影片分段翻譯
- 新增 `translationScheduler.js`：原本會從目前位置依序把整支影片翻完（40 句一批、一次一批），長影片要等很久，跳轉後也要排隊。改成只翻目前位置往後 120 秒（20 句一段、同時 2 個請求），跳轉時新位置優先。
- 用 Node 模擬 30 分鐘（600 句）影片驗證：開頭只翻前 60 句；跳到 20 分鐘時第一個請求就是該位置；看部分片段時總共只翻了 140 句。

### 2026-09-28 — Organic UI 改版
- 依設計稿改版：字幕框、滑鼠提示框、四種狀態的 toast、單字卡預覽卡、popup 設定 / 單字卡兩個分頁。
- 補上設計稿有、原本沒有的功能：介面語言切換（`uiLang`）、提示框顯示原形讀音（`basicReading`）、加入後的單字卡預覽與時間跳轉、popup 分頁與卡片展開、單字卡時間連結、記住上次分頁。
- 詞性顏色改為 OKLCH 三組（`POS_COLORS` / `POS_COLORS_LIGHT` / `POS_TINTS`），新增 `i18n.js`、`icons.js`、`popup.css`，字型內附於 `res/fonts/`。
- 已用 headless Chrome 截圖檢查 popup（中 / EN、兩個分頁）、提示框、預覽卡與 toast。

### 2026-09-28 — 預覽卡時間連結以 videoId 判斷影片
- 預覽卡的時間連結用單字卡的 `videoId` 和目前播放中的影片比對：相同才跳轉，不同影片顯示提示、不跳轉。
- 影片只以 `videoId` 辨識，不另外保存標題或頻道；`videoId` 在點擊單字當下記錄。

### 2026-09-28 — popup 點單字卡跳出完整預覽卡
- popup「單字卡」分頁改為點卡片就跳出完整預覽卡（取代原本的就地展開），可看到完整意思與說明，也能開影片時間連結或刪除。
- 預覽卡內容抽成 `src/common/wordcardView.js`，影片上的預覽卡與 popup 共用，兩邊外觀一致。
- 修正：「一鍵補生成」按鈕的事件原本被寫在 `selectTab()` 裡，每切換一次分頁就多註冊一次，按一下會送出多次請求；已移到最外層。

### 2026-09-28 — 刪除字幕的方括號標籤
- `ccFetcher.parseJson3()` 會刪除 `[音楽]`、`[拍手]`、`［笑い］` 等標籤，只有標籤的句子整句略過，斷詞、翻譯、單字卡都不會再出現這些標籤。
- 已用 Node 驗證：只有標籤、標籤在句首 / 句中 / 句尾、標籤被切在兩個片段、全形括號等情況。

---
# English
## Architecture
See the tree above. On top of the original design, three files were added:
`src/content/ytBridge.js` (page MAIN world bridge), `src/background/background.js` (service worker for network/LLM calls), `src/common/settings.js` (shared settings, in `storage.sync`) and `src/common/secrets.js` (API key in `storage.local`, restricted to trusted extension contexts so content scripts can't read it).

## Modules
| Module | Role |
|---|---|
| ytBridge | Reads the player response in the page world and captures the player's own `/api/timedtext` URL (it carries YouTube's proof-of-origin token). |
| ccFetcher | Downloads all Japanese captions of a video at once (manual track preferred, ASR fallback) as `[{text, start, end}]`. |
| ccTokenizer | Segments each line with kuromoji (IPADIC); readings converted to hiragana. |
| tokenColorizer | Assigns a color per part of speech. |
| ccDisplayer | Overlay on the player: colored tokens, optional POS labels, translation line, click-to-add wordcard. |
| translationScheduler | Playback-driven translation: only translates ~120 s ahead of the current position in 20-line chunks (2 concurrent requests, 1 retry); seeking reprioritizes the new position. |
| Translator / translatorFactory | `translateBatch(texts, lang)`; Google Translate (no key) or Gemini. |
| WordcardInfoProvider / wordcardInfoFactory | LLM-generated meaning, reading and explanation (Gemini). |
| wordcardGenerator / wordcardDB | Builds and stores cards in `chrome.storage.local`, de-duplicated by dictionary form. |
| wordcardExporter | Anki-importable TSV with `#separator`, `#html`, `#columns` headers. |
| llmLib | Gemini and OpenAI clients. |

## Changelog
### 2026-09-28 — v0.1
- All modules in the spec implemented; popup settings and wordcard management added.
- Verified in Node: json3 parsing, tokenizing/coloring, Anki export, Google Translate. Not yet tested end-to-end in Chrome.
### 2026-09-28 — API key storage
- The Gemini API key is stored on its own in `storage.local`, which is restricted to `TRUSTED_CONTEXTS`; the key never reaches content scripts. Other settings moved to `storage.sync`. Default model is now `gemini-3.1-flash-lite`.
### 2026-09-28 — Chunked translation for long videos
- Added `translationScheduler.js`. Translation no longer runs through the whole video; it follows playback and seeks, so 20+ minute videos show translations right away.
### 2026-09-28 — Organic UI redesign
- Implemented the handoff in `doc/UI mockups form` (picks 1a, 1c, 1d, 2a, 1h): caption box, hover tooltip, toast states, wordcard preview card, and a tabbed popup.
- New: UI language setting (`uiLang`), dictionary-form readings (`basicReading`), OKLCH POS palettes, `i18n.js`, `icons.js`, bundled fonts in `res/fonts/`.
### 2026-09-28 — Preview timestamp checks the video ID
- The preview card's timestamp only seeks when the card's `videoId` matches the video that is playing; otherwise it shows a notice and does not navigate. Videos are identified by `videoId` only.
### 2026-09-28 — Full preview card in the popup
- Clicking a wordcard in the popup opens the full preview card (same design as 1d, built by the shared `src/common/wordcardView.js`) instead of expanding in place.
- Fixed the "Regenerate all" click handler being registered inside `selectTab()`, which added a duplicate listener on every tab switch.
### 2026-09-28 — Strip bracket tags from captions
- `parseJson3()` removes tags such as `[音楽]`, `[拍手]` and `［笑い］` (half- and full-width brackets); lines that contain only a tag are dropped.
