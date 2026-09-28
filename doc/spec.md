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
│   ├── wait-feat.md
│   ├── cover.png / showcase.png   # README 用的圖片
│   └── UI mockups form/           # 設計稿（不提交）
│
├── src/
│   ├── background/
│   │   └── background.js          # service worker，處理翻譯與 LLM 請求
│   │
│   ├── common/
│   │   ├── settings.js            # 共用設定（預設值、讀寫、監聽），存在 storage.sync
│   │   ├── secrets.js             # API Key 讀寫，只給 background / popup 用
│   │   ├── fetchRetry.js          # fetch 包裝：503 與連線失敗時指數退避重試
│   │   ├── i18n.js                # 介面文字（zh-TW / en）、時間格式、影片連結
│   │   ├── icons.js               # Lucide 圖示（inline SVG）
│   │   └── wordcardView.js        # 預覽卡（1d）內容，影片上與 popup 共用
│   │
│   ├── content/
│   │   ├── content.js             # content script 進入點，串起所有模組
│   │   ├── ytBridge.js            # 跑在頁面 MAIN world，轉交播放器資料
│   │   ├── ccFetcher.js
│   │   ├── ccSegmenter.js         # 重新斷句（標點 / 詞性＋停頓）
│   │   ├── ccTokenizer.js
│   │   ├── tokenGrouper.js        # 依斷詞單位把 token 分組（詞 / 語幹＋語尾 / 詞組）
│   │   ├── tokenColorizer.js
│   │   ├── ccDisplayer.js
│   │   └── translationScheduler.js    # 依播放位置分段翻譯
│   │
│   ├── translate/
│   │   ├── Translator.js
│   │   ├── translatorFactory.js
│   │   ├── llmTranslatePrompt.js      # LLM 翻譯共用的 prompt 與回應解析
│   │   └── provider/
│   │       ├── GoogleTranslateProvider.js
│   │       ├── GeminiTranslateProvider.js
│   │       ├── NvidiaTranslateProvider.js
│   │       └── GroqTranslateProvider.js
│   │
│   ├── wordcard/
│   │   ├── WordcardInfoProvider.js
│   │   ├── wordcardInfoFactory.js
│   │   ├── llmWordcardPrompt.js       # LLM 單字卡 / 文法卡共用的 prompt 與回應整理
│   │   ├── wordcardGenerator.js
│   │   ├── wordcardDB.js
│   │   ├── wordcardExporter.js
│   │   └── provider/
│   │       ├── GeminiWordcardProvider.js
│   │       ├── NvidiaWordcardProvider.js
│   │       └── GroqWordcardProvider.js
│   │
│   └── llmLib/
│       ├── geminiClient.js
│       ├── nvidiaClient.js
│       ├── groqClient.js
│       └── gptClient.js
│
├── res/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── style/
│   │   └── style.css              # 字幕覆蓋層、提示框、toast、單字卡預覽
│   ├── fonts/                     # Caprasimo / Figtree / Huninn / Zen Maru Gothic (OFL)，fonts.css + woff2 子集
│   ├── icons/
│   │   └── icon128.png
│   └── lib-vendor/
│       └── kuromoji/              # kuromoji.js 0.1.2 + IPADIC 字典 (Apache-2.0)
│
└── test/
    ├── segmenter-eval.mjs         # 斷句評估腳本
    ├── kuromojiNode.mjs           # 在 Node 載入內附的 kuromoji
    └── fixtures/                  # YouTube json3 字幕（測試資料）
```

## 執行流程

```text
[YouTube 頁面 MAIN world]            [content script（隔離環境）]                 [background service worker]
ytBridge ──播放器資料/字幕網址──▶ ccFetcher ─▶ ccSegmenter ─▶ ccTokenizer ─▶ tokenColorizer ─▶ ccDisplayer
                                        │                                         │ 點擊單字
                                        └──── translate (message) ──────────────▶ translatorFactory ─▶ provider
                                                                  wordcard:add ─▶ wordcardGenerator ─▶ wordcardDB
[popup] settings / wordcardDB / wordcardExporter
```

1. `content.js` 在 `/watch` 頁面（包含 YouTube 單頁應用的換頁事件 `yt-navigate-finish`）取得 videoId。
2. `ccFetcher` 透過 `ytBridge` 拿到字幕軌，下載整支影片的日文字幕（json3）。
3. `ccSegmenter` 重新斷句：有標點依標點，沒標點的自動字幕依詞性＋停頓（設定 `sentenceSplit`，可關閉）。
4. `ccTokenizer` 用 kuromoji 斷詞，`tokenGrouper` 依斷詞單位分組，`tokenColorizer` 依詞性上色。
5. `ccDisplayer` 把字幕蓋在播放器上（原生字幕會被隱藏），並依影片時間切換句子。
6. `translationScheduler` 依播放位置分段翻譯：只翻目前位置往後約 2 分鐘的字幕，跳轉時新位置優先。
7. 點擊單字（或文法單位）→ background 產生單字卡（或文法卡）並存進 `chrome.storage.local`。

## 模組設計
### ytBridge
跑在頁面的 MAIN world（`manifest` 的 `"world": "MAIN"`）。content script 拿不到 `window.ytInitialPlayerResponse`，所以由它讀取 `#movie_player.getPlayerResponse()`，再用 `postMessage` 交給 content script。
它也會攔截播放器自己發出的 `/api/timedtext` 請求網址。YouTube 現在常要求額外的驗證參數（pot），直接用 `baseUrl` 下載可能拿到空白，這時改用播放器的網址下載。
- 只記錄帶 `pot` 的請求。頁面上也有不帶 `pot` 的字幕請求，下載回來是空的；以前全部都記，後發出的會蓋掉能用的網址，造成字幕時有時無。
- 收到 `enable-captions` 時先關掉字幕再開啟指定的軌。字幕本來就開著同一軌時，只「開啟」不會讓播放器重新請求。
### ccFetcher
一次性抓取該影片所有字幕
- 優先選人工日文字幕，沒有的話用自動產生（asr）字幕。
- 先直接下載 `baseUrl&fmt=json3`；失敗就用 `ytBridge` 記錄的播放器網址下載；還是失敗就請 `ytBridge` 重新開啟播放器字幕，等它發出新的請求（最多 15 秒）再下載。
- 取得播放器網址用輪詢（每 0.5 秒問一次 `ytBridge`），不等通知：看過的影片 YouTube 會記住字幕開著，重新整理後播放器一載入就自己抓字幕，通知可能在開始等之前就發出而錯過。
- 失敗時 console 會印出原因：「等不到播放器發出字幕請求」或「播放器的字幕網址下載回來是空的」。
- 輸出 `[{ text, start, end, words? }]`（秒）。自動字幕的時間區段互相重疊時，截到下一句開始為止。
- `words: [{ text, start }]`：自動字幕每個 seg 是一個詞，`tOffsetMs` 是它在這行的第幾毫秒。有逐詞時間、且詞接起來和整理後的文字一致時才附上，給 `ccSegmenter` 精確切時間。
- 刪除方括號標籤（`[音楽]`、`[拍手]`、`［笑い］` 等，半形 `[]` 與全形 `［］`），並清掉多餘空白；整句只有標籤時整句略過。方括號裡的內容一律刪除，所以字幕若真的有 `[…]` 文字也會被移除。
### ccSegmenter
重新斷句，讓一句一行顯示。YouTube 的字幕行常把一句切成好幾行，或一行塞好幾句。入口 `segmentCaptions(lines, { tokenize })` 依字幕選擇方式：

| 字幕 | 方式 |
|---|---|
| 有句尾標點的行 ≥ 20% | 標點斷句 `segmentByPunctuation` |
| 沒有標點、有逐詞時間（自動字幕） | 詞性斷句 `segmentByPos` |
| 沒有標點的人工字幕 | 維持原樣（評估時詞性斷句沒有比原本的斷行好） |

共用做法：先把所有字幕行接成一條「字元串流」（`buildStream`），記錄每個字元的開始 / 結束時間，以及詞與詞、行與行之間的停頓。有逐詞時間時，字元時間平均分配在「這個詞開始 ~ 下個詞開始」之間；沒有時依字數比例分配。斷句就是在串流上選斷點（`selectCuts`），所以兩種方式都能用逐詞時間。

**標點斷句**
- 「。．！？!?…」（後面可接 」』）等關閉符號）之後一定斷；「、」不當作斷句點。
- 一句最多 42 字、最長 8 秒，超過時在字幕行交界斷開。

**詞性斷句**（用 kuromoji 的詞性、`pos_detail_1`、`conjugated_form`）
- 不能斷的位置：下一個是助詞 / 助動詞 / 接尾 / 非自立語 / 記號；前一個是接頭詞、格助詞 / 係助詞 / 副助詞 / 並立助詞 / 「の」 / 接續助詞，或活用到一半（連用形、未然形…）。
- 加分：終助詞、句尾助動詞（ます / です / た / だ / う / ん / じゃん…）、命令形、感動詞 +3；其他助動詞、動詞 / 形容詞基本形 +1。下一個是接續詞或句首的「では / じゃあ」+2，是連體詞 +2（前面要有加分），是感動詞 / フィラー +1。
- 停頓：> 0.8 秒 +3、> 0.4 秒 +1.5、> 1.5 秒一定斷。停頓 = 下個詞開始 − 這個詞開始 − 估計發音時間（每字 0.13 秒）。
- 分數 ≥ 3 且這句 ≥ 4 字就斷；超過 42 字 / 8 秒時斷在這段裡分數最高的位置。
- kuromoji 會把句首的「では」拆成助動詞「で」＋「は」，特別處理成可斷開。

**評估**（`test/segmenter-eval.mjs`）
- 把有標點的真實字幕拿掉「。！？」和「、」，看斷句能不能找回原本句尾的位置（±1 字）。文字完全相同，可以逐字比對。
- 測試資料是 YouTube 的 json3 字幕（`test/fixtures/`，不提交，下載方式見腳本開頭），kuromoji 直接用 `res/lib-vendor` 內附的版本（`test/kuromojiNode.mjs`），不需要安裝套件。
- 2026-09-28 的結果（2 支自動字幕、6 支人工字幕）：

| | 精確率 | 召回率 | F1 | 可接受（斷在句尾或逗號） |
|---|---|---|---|---|
| 自動字幕：原本的斷行 | 19.7% | 27.1% | 22.7% | 23.2% |
| 自動字幕：只看停頓 | 50.1% | 42.9% | 45.8% | 56.9% |
| **自動字幕：詞性＋停頓** | **69.7%** | **77.6%** | **73.1%** | **75.2%** |
| 人工字幕：原本的斷行 | 65.7% | 56.5% | 60.4% | 73.3% |
| 人工字幕：詞性＋停頓 | 63.2% | 56.7% | 59.2% | 72.8% |

- 已知限制：兩句都以形容詞 / 動詞基本形結尾且中間沒有停頓時（例：「頭が痛い｜天気が悪くて頭が痛い」），因為基本形也可能是修飾名詞的連體形，不會斷開。

設定 `sentenceSplit`（「重新斷句」，預設開啟）可關閉，切換時會重新處理字幕。
### ccTokenizer
將所有字幕，處理詞性切割
- 使用 kuromoji（IPADIC），斷詞後交給 `tokenGrouper` 依設定 `tokenUnit` 分組，每個顯示單位為 `{ surface, kind, pos, posDetail, basicForm, reading, basicReading, host?, parts? }`，讀音轉成平假名。
- `kind`：`word` = 單字（點了建立單字卡）、`grammar` = 文法（助詞、助動詞、語尾，點了建立文法卡）。
- 單字：`basicForm` 是主要自立語的原形；`reading` 是出現形的讀音（生き → いき），`basicReading` 是把原形再斷詞一次得到的原形讀音（生きる → いきる）。
- 文法：`basicForm` 就是出現的樣子（たら、たんだ）；`host` 是它前面最近的單字原形（回る），給 LLM 當上下文；`parts` 是組成（た＋ん＋だ）。
- 斷詞前先正規化：自動字幕有時把平假名的擬聲詞寫成夾片假名的長音（ぐルーって），會讓 kuromoji 斷錯（今なんかぐ → 今｜な｜ん｜かぐ）。前面是平假名、後面不是片假名時，把「片假名 1 字 + ー」轉回平假名（ぐるーって）；片假名單字（ぐルーム、コーヒー）不受影響。
- 字典裡沒有的詞沒有讀音；整個詞都是假名時，讀音就是它本身。
- kuromoji 內部用 `path.join` 組字典網址，會把 `chrome-extension://` 壓成 `chrome-extension:/`，載入字典時會暫時修正 XHR 網址。
### tokenGrouper
IPADIC 會把活用拆得很碎（戻っ｜た｜ん｜だ｜よ｜ね），依設定 `tokenUnit` 分組：

| 斷詞單位 | 例：今なんかぐるーって回ったら元いた場所に戻ったんだよね |
|---|---|
| `word` 詞 | 今｜なんか｜ぐるー｜って｜回っ｜たら｜元｜い｜た｜場所｜に｜戻っ｜た｜ん｜だ｜よ｜ね |
| `stem` 語幹＋語尾（預設） | 今｜なんか｜ぐるー｜って｜回っ｜たら｜元｜い｜た｜場所｜に｜戻っ｜たんだ｜よね |
| `phrase` 詞組 | 今｜なんか｜ぐるー｜って｜回ったら｜元｜いた｜場所｜に｜戻ったんだ｜よね |

- 語尾：助動詞、補助動詞（いる、しまう…）、動詞接尾（れる、させる）、接續助詞 て / で / ば / ちゃ / じゃ / たり、以及後面接助動詞的「ん / の」（〜んだ、〜のです）。語幹＋語尾時連續的語尾併成一個文法單位（てしまった、なければならないのです）；詞組時併進前面的單字。
- 連續的終助詞併在一起（よね、かな）。
- 其他助詞（に、は、って、なんか）一律獨立，屬於文法。語幹一律和語尾分開，包括一個字的語幹（い｜た）。
- kuromoji 單獨切出的長音「ー」（ぐる｜ー）接回前一個。
### tokenColorizer
將不同詞性的字幕上色。顏色以 OKLCH 產生（各詞性共用同一亮度，助詞 / 記号 / フィラー / その他 為中性色），分三組：
- `POS_COLORS`：深色字幕框上的文字
- `POS_COLORS_LIGHT`：米色底上的文字（popup 圓點、單字卡詞性圓圈）
- `POS_TINTS`：填色（選取中的詞性 chip、單字卡詞性圓圈底色）
### ccDisplayer
將所有部分組裝顯示
- 覆蓋層掛在 `#movie_player` 內，以 `requestAnimationFrame` + 二分搜尋對應目前的句子。
- 每個 token 上方可顯示詞性名稱（依設定的詞性清單），點擊即加入單字卡；文法單位（`kind: "grammar"`）點擊則加入文法卡。
- 標點符號不可點擊：詞性為「記号」，或整個 token 都是標點 / 符號 / 空白（Unicode `\p{P}\p{S}\s`，因為半形 `!?`、`%`、`♪` 會被 kuromoji 標成名詞）。這些 token 沒有提示框、滑鼠停留不反白、點了不會建立單字卡。
- 字幕位置與大小（`applyLayout`）：依設定 `captionPosition`（下方 / 上方）、`captionOffset`（距離邊緣，播放器高度的 0～50%）、`captionSize`（70～200%），設定覆蓋層的 CSS 變數 `--cw-offset`、`--cw-scale` 與 `.cw-at-top`。字幕字體、詞性名稱、翻譯與字幕框內距一起縮放，提示框與預覽卡不縮放。下方時距離底部 70px（控制列隱藏時 24px）＋ offset，上方時距離頂部 60px（控制列隱藏時 16px）＋ offset。設定改變時即時套用。
- 字幕在上方時，提示框改到單字下方；預覽卡則看單字上下哪邊空間大就放哪邊（`.cw-card-below` 時箭頭在卡片上緣）。
- 提示框（取代原本的 `title`）：原形 + 原形讀音、`詞性・細分類` 與出現形讀音標籤、「點一下加入單字卡」。文法單位改為「〜たんだ」、`文法・詞性` 與組成（た＋ん＋だ）標籤、「點一下加入文法卡」。
- `toast(message, state)`：state 為 `loading` / `success` / `duplicate` / `warning` / `error`，各有圖示與顏色；loading 會留著直到被取代，其他 2.5 秒後消失。建立期間點擊的單字保持反白。
- `showCard(card, tokenEl)`：加入成功後在單字上方顯示預覽卡（意思、說明、例句、更多例句、時間連結），以單字為中心並限制在播放器內；播放器太矮時內容可捲動。按 ✕、點外面或換句子時關閉。
- 預覽卡的時間連結：卡片的 `videoId` 等於目前播放中的影片時，直接跳到該句（不重新載入頁面）；是不同影片時不跳轉，改顯示提示「這張單字卡來自另一支影片（{videoId}），無法跳轉」。Ctrl / Shift / 中鍵點擊仍可開新分頁。
- 重複、警告、錯誤仍使用 toast；字幕已換句找不到點擊的單字時，成功也改用 toast。
### translationScheduler
依播放位置分段翻譯，解決長影片（20 分鐘以上）要等很久才有翻譯的問題
- 字幕每 20 句為一段（chunk），只翻「目前位置 ~ 往後 120 秒」涵蓋的段落，沒看到的部分不會翻。
- 監聽影片的 `timeupdate` / `seeking` / `play`，播放前進時自動補下一段；跳轉時從新位置所在的段落開始。
- 同時最多 2 個請求，失敗會重試 1 次，仍失敗才顯示一次錯誤提示。
- 切換翻譯語言、翻譯引擎、LLM 提供者或開關翻譯時，只重新開始翻譯，不重新抓字幕；已翻過的句子由 background 的快取直接回傳。
### Translator
將所有字幕整句翻譯（介面：`translateBatch(texts, targetLang, { title }) → string[]`）
- `GoogleTranslateProvider`：Google 翻譯公開端點，不需 API Key。多句用換行合併成一次請求，句數對不上時改為逐句翻譯。忽略 `title`。
- `GeminiTranslateProvider` / `NvidiaTranslateProvider` / `GroqTranslateProvider`：將一批句子當作上下文一起送給 LLM，要求回傳 `{"translations": [...]}`；解析時也接受直接回傳的陣列。prompt 與解析共用 `translate/llmTranslatePrompt.js`。
- prompt 說明這些是口語或歌詞、要意譯而不是逐字翻，並附上影片標題當背景資訊（由 `ytBridge` 從播放器資料取得，經 `translate` 訊息傳到 background），註明只供參考、不要翻譯或照標題改寫字幕。
- NVIDIA / Groq 翻譯呼叫時關閉 `strictJson`（見 llmLib）：它們的 JSON 模式要求最外層是物件，模型常照樣回傳陣列，Groq 會直接回 400 `json_validate_failed`。
### translatorFactory
依照設定選擇具體的翻譯實作：`translateProvider` 為 `google` 時用 Google 翻譯；為 `llm` 時依 `llmProvider`（`gemini` / `nvidia` / `groq`）選擇。
### WordCardInfoProvider
將單字卡的資訊生成（介面：`getInfo(input, targetLang) → { meaning, reading, explanation, examples }`，`examples` 為 LLM 補充的 2 句例句 `[{ sentence, translation }]`）。`input.kind` 為 `grammar` 時，`word` 是文法本身（たら、たんだ），`host` 是它接在後面的單字，改生成文法卡的內容（見 wordcardGenerator）。
### wordcardInfoFactory
依設定 `llmProvider`（`gemini` / `nvidia` / `groq`）選擇生成單字卡資訊的實作。單字卡永遠用 LLM，和翻譯引擎選 `llm` 時用的是同一個提供者。三個 provider 的 prompt 與回應整理共用 `wordcard/llmWordcardPrompt.js`，provider 本身只負責呼叫各自的 client。
### wordcardGenerator
產生完整單字卡：`{ id, type, word(原形), surface, reading, pos, meaning, explanation, examples, sentence, sentenceTranslation, videoId, time, createdAt, host? }`。
- `type`：`word` 單字卡、`grammar` 文法卡（點文法單位時建立；`word` 是文法本身，例如「たら」，`host` 是它接在後面的單字）。舊的卡片沒有 `type`，視為單字卡。
- 文法卡由各 provider 的 `getGrammarInfo` 生成：`meaning` 是這個文法在句中的功能，`explanation` 說明接續方式、語感和句中意思（多個部分組成時逐一說明），另附 2 個例句。
- 顯示時文法卡前面加「〜」（〜たら），詞性標籤顯示「文法」；popup 清單的圓圈顯示「文」；Anki 匯出的正面也是「〜たら」。
- 重複檢查依 `type` 分開（`findWordcard(word, type)`）。影片只以 `videoId` 辨識，在點擊單字當下記錄（等待回應期間換了影片也不會記錯）。LLM 失敗（例如沒有 API Key）時仍會保存基本資料，並回傳警告。
### wordcardDB
保存單字卡（`chrome.storage.local` 的 `wordcards`），以原形＋`type` 去除重複（單字卡和文法卡分開算）
### wordcardExporter
將單字卡依照anki支援的格式匯出：UTF-8 TSV，帶有 `#separator:tab`、`#html:true`、`#columns:` 標頭，例句中的單字會以粗體標示。
- 欄位順序：`Front`、`Back`、`Word`、`Reading`、`Meaning`、`PartOfSpeech`、`Explanation`、`Sentence`、`SentenceTranslation`、`Source`、`Examples`。
- Anki 內建的「基本型」只有正面 / 背面兩個欄位，匯入時依順序對應前兩欄，所以前兩欄是組合好的內容：`Front` = 單字（大字）；`Back` 分成有標題的三段：**讀音**、**解釋**（意思＋詞性、說明）、**例句**（影片原句＋補充例句，單字粗體，各附翻譯），最後是 YouTube 連結。字級固定、主次分明（讀音 24px > 意思 19px > 例句 17px > 說明 / 翻譯 14px > 標題 / 連結 12–13px），次要文字用透明度變淡，深色 / 淺色模式都適用。段落標題依介面語言（中 / EN）。直接用基本型匯入就能看到全部內容。
- 後面的獨立欄位給想自訂筆記類型的人用：匯入時把欄位對應到自己的筆記類型，不需要的欄位選「無」。
### llmLib
存放llm呼叫的api
- `geminiClient`：Gemini `generateContent`，支援 JSON 輸出（`responseMimeType`）。重試次數 8 次。
- `nvidiaClient`：NVIDIA API（`integrate.api.nvidia.com`，OpenAI 相容格式），預設模型 `meta/llama-3.3-70b-instruct`。
- `groqClient`：Groq API（`api.groq.com/openai/v1`，OpenAI 相容格式），預設模型 `llama-3.3-70b-versatile`。
- NVIDIA / Groq 的 `generate(prompt, { json, strictJson })`：`strictJson`（預設開）會送 `response_format: json_object`，強制最外層是物件；關掉時不送，改用 `parseJsonLoose` 自己解析（會拆掉 \`\`\`json 圍欄）。
- `gptClient`：OpenAI Chat Completions（已實作，尚未接上 provider）。
### fetchRetry
所有 LLM 與 Google 翻譯的請求都經過 `fetchWithRetry(url, init, retryOptions)`：
- 回應是 503，或 `fetch()` 本身丟出錯誤時，以指數退避重試：1 秒起、每次加倍、上限 8 秒，並加上隨機抖動；有 `Retry-After` 時照它等。預設最多重試 4 次，Gemini 8 次。
- 為什麼要重試連線錯誤：擴充功能對同一網址連續收到 503 後，瀏覽器會暫時擋下後續請求（DevTools 顯示 0 byte、1 毫秒、沒有狀態碼），JavaScript 只看到「Failed to fetch」。Gemini 過載時翻譯請求很容易觸發。
- 其他狀態碼（4xx 等）不重試，把 response 交回呼叫端處理。
### background
MV3 service worker。所有對外網路請求都在這裡（需要 `host_permissions`，包含 Google 翻譯、Gemini、NVIDIA、Groq 的網域），並快取翻譯結果。訊息：`translate`、`wordcard:add`、`wordcard:regenerate`（把沒有 `meaning` 的單字卡逐張重跑 LLM，遇到錯誤就停止，回傳 `{ fixed, error? }`）。
- 翻譯快取的 key 是 `${引擎}|${翻譯語言}|${原文}`，引擎為 `google` 或 `llm-${llmProvider}`，換提供者不會拿到別的提供者翻的結果。
- 翻譯失敗時錯誤訊息前面會加上實際使用的引擎，例如 `[llm-gemini] Failed to fetch`。
### settings / popup
一般設定存在 `chrome.storage.sync` 的 `settings`：啟用、介面語言 `uiLang`（`zh-TW` / `en`，和翻譯語言無關）、顯示翻譯、重新斷句 `sentenceSplit`、斷詞單位 `tokenUnit`（詞 / 語幹＋語尾 / 詞組，預設語幹＋語尾）、翻譯語言（繁體中文 / English）、翻譯引擎 `translateProvider`（`google` / `llm`）、LLM 提供者 `llmProvider`（`gemini` / `nvidia` / `groq`，預設 `gemini`）、各提供者的模型 `geminiModel`（預設 `gemini-3.1-flash-lite`）/ `nvidiaModel` / `groqModel`、字幕外觀（位置 `captionPosition`、距離邊緣 `captionOffset`、大小 `captionSize`）、要顯示名稱的詞性。
- 字幕外觀的兩個滑桿拖動時只更新數字，放開才儲存：`storage.sync` 每分鐘的寫入次數有上限，拖動時每一格都寫入會超過。
popup 分兩個分頁（會記住上次的分頁）：
- 設定：header 有介面語言切換（中 / EN）與啟用開關；斷詞單位、翻譯語言、翻譯引擎、字幕位置用分段按鈕；詞性用可點選的 chip。區塊標題為粗體。
- 「重新斷句」是斷詞單位右邊的圓形按鈕（`refresh-cw` 圖示，開啟時為強調色，`aria-pressed` 表示狀態）。
- 「LLM（翻譯 / 單字卡生成）」區塊：提供者下拉選單，下面的 API Key 與模型欄位只有一組，會顯示目前提供者的值；切換提供者時換成該提供者存的值。下拉選單一改就儲存；文字欄位在失焦或按 Enter 時儲存。
- 單字卡：頂端顯示生成失敗（沒有字義）的單字卡數量與「一鍵補生成」按鈕；最新的在最上面，每張顯示詞性、單字、讀音、意思。**點卡片會跳出完整預覽卡**（和影片上的 1d 同一個樣式，由 `wordcardView.js` 產生）：單字、讀音、詞性、完整意思、說明、例句、例句翻譯、時間連結（開新分頁）與刪除。還沒取得字義的卡片會提示用「一鍵補生成」補上。按 ✕、點背景或 Esc 關閉；補生成更新了這張卡時會即時更新內容。底部為匯出與全部清除。
- popup 也載入 `res/style/style.css` 取得預覽卡的樣式（`.cw-card` 上有自己的色彩變數，不依賴 `.cw-overlay`）。
### UI 設計（Organic）
依 `doc/UI mockups form/design_handoff_caption_wordinizer_organic/README.md` 實作，採用的版本為 1a（字幕 + 提示框）、1c（toast）、1d（單字卡預覽）、2a（設定分頁）、1h（單字卡分頁）。
- 顏色：米色 `#f5ead8` 底、陶土色 `#c67139` 強調色、鼠尾草綠 `#7a8a5e` 表示成功。
- 字型：Caprasimo（標題）、Figtree（內文）、Huninn（中文）、Zen Maru Gothic（日文）。全部內附於 `res/fonts/`，popup 直接引用 `fonts.css`；content script 讀取 `fonts.css` 後把相對路徑換成 `chrome-extension://` 網址，再注入 YouTube 頁面。
- 圖示：Lucide（`src/common/icons.js`）。
- 和設計稿不同處：模型欄位預設值維持 `gemini-3.1-flash-lite`（設計稿寫 `gemini-2.5-flash`）；預覽卡在播放器太矮時改為可捲動。
### secrets（API Key 的保存）
- API Key 單獨存在 `chrome.storage.local`，每個提供者一個 key：`geminiApiKey`、`nvidiaApiKey`、`groqApiKey`，不和一般設定放在一起。
- background 每次啟動都會呼叫 `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`，讓 `local`（API Key、單字卡）只有 background 與 popup 讀得到，content script 讀不到。
- API Key 只在 background 中和設定合併，用來呼叫 LLM，不會傳給 content script。
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

### 2026-09-28 — 依標點符號重新斷句
- 新增 `ccSegmenter.js`：一句跨多行時合併、一行多句時拆開，一句一行顯示；翻譯也因此拿到完整句子。
- 設定頁新增「依標點斷句」開關（`sentenceSplit`，預設開啟）；字幕幾乎沒有標點時自動維持原本斷行。
- 已用 Node 驗證：跨行合併、一行多句拆開、引號、停頓分句、超過字數上限、幾乎沒有標點等情況。

### 2026-09-28 — 標點符號不可點擊
- 字幕中的標點符號（「」。、！？…♪ 等）不能再被點擊加入單字卡，也不顯示提示框或反白。
- 已用 kuromoji 驗證：`!?`、`%`、`♪` 雖被標成名詞，也會正確判斷為標點；一般單字（含 `ｗｗｗ`）仍可點擊。

### 2026-09-28 — 詞性斷句
- 先確認真實資料：用 yt-dlp 下載 6 支影片的字幕（2 支同時有人工與自動字幕）。發現現在的日文自動字幕**大多已經有標點**，且每個詞都有 `tOffsetMs`。
- `ccFetcher` 保留自動字幕的逐詞時間（`words`）；`ccSegmenter` 改寫成「字元串流 + 選斷點」的架構，標點斷句也改用逐詞時間，自動字幕的換句時間從「依字數比例」變成精確到詞。
- 新增詞性斷句（規則見 ccSegmenter 一節），用於沒有標點的自動字幕；沒有標點的人工字幕維持原樣。
- 新增評估腳本 `test/segmenter-eval.mjs` 與 `test/kuromojiNode.mjs`，依評估結果調整規則與參數（門檻 3、最少 4 字、行交界 +2）。自動字幕 F1 從 22.7%（原本的斷行）提升到 73.1%。
- 設定改名為「重新斷句」（仍是 `sentenceSplit`）。
- 未達成：計畫的精確率目標是 80%，目前是 69.7%（斷在句尾或逗號的可接受率 75.2%）。

### 2026-09-28 — 字幕位置與大小設定
- 設定頁新增「字幕外觀」：位置（下方 / 上方）、距離邊緣（0～50%）、大小（70～200%），即時套用到正在播放的影片。
- 字幕在上方時，提示框改到單字下方；預覽卡改為依上下空間自動選擇位置。
- 已用 headless Chrome 截圖檢查：設定頁、上方＋提示框、上方＋預覽卡、下方放大 150%、下方縮小 70%＋預覽卡。

### 2026-09-28 — Anki 匯出支援基本型
- 問題：用 Anki 內建的「基本型」匯入時，正面 / 背面只能各對應一欄，看不到讀音、意思、詞性、例句等其他內容。
- 匯出檔前兩欄改為組合好的 `Front`（單字）與 `Back`（讀音、意思、詞性、說明、例句、翻譯、補充例句、連結），直接用基本型匯入即可；原本的獨立欄位移到後面。
- 注意：欄位順序改變，之前用自訂筆記類型匯入過的人，要重新設定一次欄位對應。

### 2026-09-28 — Anki 背面重新排版
- 問題：背面沒有標示哪段是讀音 / 解釋 / 例句，而且意思、說明、例句字級都差不多，閱讀時分不出主次。
- 背面分成「讀音 / 解釋 / 例句」三段並加上小標題，段落間用細線分隔；字級改成固定大小並拉開層級，正面單字放大。

### 2026-09-28 — 斷詞單位與文法卡
- 問題：IPADIC 把活用拆得很碎（戻っ｜た｜ん｜だ｜よ｜ね），詞性名稱又比單一個字寬，字幕看起來很散。
- 新增 `tokenGrouper.js` 與設定「斷詞單位」：詞 / **語幹＋語尾**（預設，戻っ｜たんだ｜よね）/ 詞組（戻ったんだ｜よね）。
- 助詞、助動詞、語尾改為「文法」：點了建立文法卡（`type: "grammar"`），由 Gemini 說明功能、接續、語感與句中意思並附例句；卡片顯示為「〜たんだ」、標籤「文法」。提示框顯示組成（た＋ん＋だ）。
- 斷詞前正規化夾在平假名中的片假名長音（ぐルーって → ぐるーって），修正「なんか」被斷成「な｜ん｜かぐ」的問題。
- 已用 Node 測試分組與正規化，並在 headless Chrome 載入實際的 kuromoji 端到端檢查三種模式的顯示與文法提示框。

### 2026-09-29 — 多個 LLM 提供者、503 重試、重新整理後字幕消失
- **LLM 提供者**：新增 `nvidiaClient`、`groqClient` 與對應的翻譯 / 單字卡 provider。設定改為「翻譯引擎：Google 翻譯 / LLM」＋「LLM 提供者」下拉選單（`llmProvider`），單字卡與翻譯共用同一個提供者，原本的 `wordcardProvider` 設定移除。每個提供者的 API Key 與模型各自保存。
- **503 重試**：新增 `fetchRetry.js`，503 與連線失敗都以指數退避重試。實測 Gemini 翻譯一直「Failed to fetch」的原因：`gemini-3.1-flash-lite` 頻繁回 503，連續 503 後瀏覽器暫時擋下擴充功能的請求，原本的重試不處理這種錯誤。
- **Groq 翻譯 400**：翻譯要的是陣列，但 Groq 的 JSON 模式要求最外層是物件，模型回傳陣列就被拒絕（`json_validate_failed`）。prompt 改為要求 `{"translations": [...]}`，NVIDIA / Groq 翻譯並關閉 `strictJson`。
- **重新整理看過的影片後字幕消失**：原因有三層，都已修正（見 ytBridge、ccFetcher）：錯過播放器抓字幕的通知、記下不帶 `pot` 的網址、字幕已開著時播放器不會重新請求。已在 Edge 對兩支影片重複重新整理確認。
- **其他**：切換 LLM 提供者時立即重新翻譯（原本只比較 `translateProvider`）；翻譯錯誤訊息標出實際引擎；「重新斷句」改為斷詞單位右邊的圖示按鈕；設定頁標題改為粗體。
- 已知問題（見 wait-feat）：NVIDIA / Groq 關閉 `strictJson` 後，模型若在 JSON 前後多寫說明文字會解析失敗；「重新斷句」按鈕快速連點可能漏掉一次切換。

---
# English
## Architecture
The directory tree is the same as in the [Chinese section](#這個專案的架構) above (its comments are in Chinese). In short:
- `src/background/` — MV3 service worker for translation and LLM requests.
- `src/common/` — shared settings (`storage.sync`), API key storage, the retrying `fetch` wrapper, UI strings (zh-TW / en), Lucide icons, and the wordcard preview card shared by the video overlay and the popup.
- `src/content/` — content script entry point, the page-world bridge, and the caption pipeline (fetch → re-split → tokenize → group → color → display, plus playback-driven translation).
- `src/translate/`, `src/wordcard/`, `src/llmLib/` — translation providers (Google / Gemini / NVIDIA / Groq), wordcard generation (Gemini / NVIDIA / Groq) / storage / Anki export, LLM clients.
- `res/` — popup, overlay stylesheet, bundled fonts (Caprasimo / Figtree / Huninn / Zen Maru Gothic, OFL), icon, and kuromoji.js 0.1.2 + IPADIC dictionary (Apache-2.0).
- `test/` — sentence-splitting evaluation script, a Node loader for the bundled kuromoji, and json3 caption fixtures.

## Execution flow
See the diagram in the Chinese section.

1. `content.js` gets the videoId on `/watch` pages (including YouTube's SPA navigation event `yt-navigate-finish`).
2. `ccFetcher` gets the caption tracks through `ytBridge` and downloads the whole video's Japanese captions (json3).
3. `ccSegmenter` re-splits sentences: at punctuation when present; unpunctuated auto captions by part of speech + pauses (setting `sentenceSplit`, can be turned off).
4. `ccTokenizer` tokenizes with kuromoji, `tokenGrouper` groups tokens by the segmentation unit, and `tokenColorizer` colors by part of speech.
5. `ccDisplayer` overlays the captions on the player (native captions are hidden) and switches lines by video time.
6. `translationScheduler` translates in chunks around playback: only ~2 minutes ahead of the current position; seeks take priority.
7. Clicking a word (or grammar unit) → the background builds a wordcard (or grammar card) and saves it in `chrome.storage.local`.

## Module design
### ytBridge
Runs in the page's MAIN world (`"world": "MAIN"` in the manifest). Content scripts can't read `window.ytInitialPlayerResponse`, so it reads `#movie_player.getPlayerResponse()` and hands it over with `postMessage`.
It also captures the `/api/timedtext` URL the player requests itself. YouTube now often requires an extra proof-of-origin parameter (pot), so downloading from `baseUrl` directly may return nothing; in that case the player's URL is used.
- Only requests carrying `pot` are recorded. The page also makes caption requests without `pot`, which return an empty body; recording everything let a later one overwrite the working URL, so captions appeared only sometimes.
- On `enable-captions` it turns captions off and then on with the requested track. If the same track is already on, just turning it on doesn't make the player request again.
### ccFetcher
Fetches all captions of the video at once.
- Prefers manual Japanese captions, falls back to auto-generated (ASR).
- Tries `baseUrl&fmt=json3` first; on failure uses the player URL recorded by `ytBridge`; if that fails too, asks `ytBridge` to turn the player's captions back on and waits (up to 15 s) for a new request before downloading.
- The player URL is polled (asking `ytBridge` every 0.5 s) instead of waiting for a notification: YouTube remembers that captions were on for a watched video, so after a refresh the player fetches captions as soon as it loads, and the notification could fire before we start waiting.
- On failure the console says why: "no caption request from the player" or "the player's caption URL returned nothing" (logged in Chinese).
- Output: `[{ text, start, end, words? }]` (seconds). Overlapping ASR segments are cut at the start of the next line.
- `words: [{ text, start }]`: in auto captions each seg is one word and `tOffsetMs` is its offset in the line. Attached only when word timing exists and the words join back into the cleaned text, so `ccSegmenter` can cut timing precisely.
- Removes bracket tags (`[音楽]`, `[拍手]`, `［笑い］`, half-width `[]` and full-width `［］`) and extra spaces; lines that contain only a tag are dropped. Anything inside brackets is removed, so real `[…]` text in a caption is removed too.
### ccSegmenter
Re-splits captions so each line is one sentence. YouTube lines often cut one sentence across several lines or pack several sentences into one. The entry point `segmentCaptions(lines, { tokenize })` picks a method per track:

| Captions | Method |
|---|---|
| ≥ 20% of lines have sentence-ending punctuation | Punctuation splitting `segmentByPunctuation` |
| No punctuation, word timing available (auto captions) | POS splitting `segmentByPos` |
| Manual captions without punctuation | Left as-is (POS splitting did not beat the original lines in evaluation) |

Shared approach: all caption lines are joined into one "character stream" (`buildStream`) that records each character's start / end time and the pauses between words and lines. With word timing, a character's time is spread evenly between "this word's start ~ next word's start"; without it, by character count. Splitting means choosing cut points on the stream (`selectCuts`), so both methods benefit from word timing.

**Punctuation splitting**
- Always cut after 「。．！？!?…」 (optionally followed by closing marks such as 」』); 「、」 is not a cut point.
- A sentence is at most 42 characters / 8 seconds; longer ones are cut at a caption-line boundary.

**POS splitting** (uses kuromoji's POS, `pos_detail_1` and `conjugated_form`)
- No cut when: the next token is a particle / auxiliary verb / suffix / non-independent word / symbol; or the previous token is a prefix, a case / binding / adverbial / parallel particle, 「の」, a conjunctive particle, or a mid-conjugation form (連用形, 未然形…).
- Score: sentence-final particle, sentence-ending auxiliary (ます / です / た / だ / う / ん / じゃん…), imperative, interjection +3; other auxiliaries, plain-form verb / adjective +1. Next token is a conjunction or sentence-initial 「では / じゃあ」 +2, an adnominal +2 (requires a score before it), an interjection / filler +1.
- Pauses: > 0.8 s +3, > 0.4 s +1.5, > 1.5 s always cut. Pause = next word start − this word start − estimated speaking time (0.13 s per character).
- Cut when the score ≥ 3 and the sentence is ≥ 4 characters; above 42 characters / 8 seconds, cut at the highest-scoring position in the span.
- kuromoji splits a sentence-initial 「では」 into auxiliary 「で」 + 「は」; this is special-cased as a valid cut.

**Evaluation** (`test/segmenter-eval.mjs`)
- Take real punctuated captions, remove 「。！？」 and 「、」, and check whether splitting recovers the original sentence ends (±1 character). The text is identical, so it can be compared character by character.
- Test data is YouTube json3 captions (`test/fixtures/`, not committed; see the top of the script for how to download them). kuromoji is loaded straight from `res/lib-vendor` (`test/kuromojiNode.mjs`), so no packages need to be installed.
- Results on 2026-09-28 (2 auto-caption videos, 6 manual-caption videos):

| | Precision | Recall | F1 | Acceptable (cut at sentence end or comma) |
|---|---|---|---|---|
| Auto: YouTube's original lines | 19.7% | 27.1% | 22.7% | 23.2% |
| Auto: pauses only | 50.1% | 42.9% | 45.8% | 56.9% |
| **Auto: POS + pauses** | **69.7%** | **77.6%** | **73.1%** | **75.2%** |
| Manual: original lines | 65.7% | 56.5% | 60.4% | 73.3% |
| Manual: POS + pauses | 63.2% | 56.7% | 59.2% | 72.8% |

- Known limitation: when two sentences both end in a plain-form adjective / verb with no pause between them (e.g. 「頭が痛い｜天気が悪くて頭が痛い」), no cut is made, because the plain form can also be an attributive form modifying a noun.

The `sentenceSplit` setting ("Re-split sentences", on by default) can turn this off; toggling it reprocesses the captions.
### ccTokenizer
Splits all captions by part of speech.
- Uses kuromoji (IPADIC); the tokens are then grouped by `tokenGrouper` according to the `tokenUnit` setting. Each display unit is `{ surface, kind, pos, posDetail, basicForm, reading, basicReading, host?, parts? }`, readings converted to hiragana.
- `kind`: `word` = a word (click to create a wordcard), `grammar` = grammar (particles, auxiliaries, endings; click to create a grammar card).
- Words: `basicForm` is the dictionary form of the main independent word; `reading` is the reading of the surface form (生き → いき), and `basicReading` is the reading of the dictionary form, obtained by tokenizing the dictionary form again (生きる → いきる).
- Grammar: `basicForm` is the surface form as it appears (たら, たんだ); `host` is the dictionary form of the nearest word before it (回る), given to the LLM as context; `parts` lists its components (た＋ん＋だ).
- Text is normalized before tokenizing: auto captions sometimes write a hiragana onomatopoeia with a katakana long vowel in the middle (ぐルーって), which makes kuromoji split wrongly (今なんかぐ → 今｜な｜ん｜かぐ). When preceded by hiragana and not followed by katakana, "one katakana character + ー" is converted back to hiragana (ぐるーって); katakana words (ぐルーム, コーヒー) are unaffected.
- Words not in the dictionary have no reading; if the whole word is kana, its reading is the word itself.
- kuromoji builds dictionary URLs with `path.join`, which collapses `chrome-extension://` into `chrome-extension:/`; the XHR URL is patched temporarily while the dictionary loads.
### tokenGrouper
IPADIC splits conjugations into tiny pieces (戻っ｜た｜ん｜だ｜よ｜ね). Tokens are grouped by the `tokenUnit` setting:

| Unit | Example: 今なんかぐるーって回ったら元いた場所に戻ったんだよね |
|---|---|
| `word` Word | 今｜なんか｜ぐるー｜って｜回っ｜たら｜元｜い｜た｜場所｜に｜戻っ｜た｜ん｜だ｜よ｜ね |
| `stem` Stem + ending (default) | 今｜なんか｜ぐるー｜って｜回っ｜たら｜元｜い｜た｜場所｜に｜戻っ｜たんだ｜よね |
| `phrase` Phrase | 今｜なんか｜ぐるー｜って｜回ったら｜元｜いた｜場所｜に｜戻ったんだ｜よね |

- Endings: auxiliary verbs, subsidiary verbs (いる, しまう…), verb suffixes (れる, させる), the conjunctive particles て / で / ば / ちゃ / じゃ / たり, and 「ん / の」 followed by an auxiliary (〜んだ, 〜のです). With stem + ending, consecutive endings merge into one grammar unit (てしまった, なければならないのです); with phrase, they merge into the preceding word.
- Consecutive sentence-final particles merge (よね, かな).
- Other particles (に, は, って, なんか) always stand alone as grammar. The stem is always separated from its ending, including one-character stems (い｜た).
- A long vowel 「ー」 split off by kuromoji (ぐる｜ー) is joined back to the previous unit.
### tokenColorizer
Colors captions by part of speech. Colors are generated in OKLCH (all POS share one lightness; particles / 記号 / フィラー / その他 are neutral) in three sets:
- `POS_COLORS`: text on the dark caption box
- `POS_COLORS_LIGHT`: text on the beige background (popup dots, POS circle on wordcards)
- `POS_TINTS`: fills (selected POS chips, POS circle background on wordcards)
### ccDisplayer
Assembles and displays everything.
- The overlay is mounted inside `#movie_player`; the current line is found with `requestAnimationFrame` + binary search.
- Each token can show its POS name above it (per the POS list in settings); clicking adds a wordcard, and clicking a grammar unit (`kind: "grammar"`) adds a grammar card.
- Punctuation is not clickable: POS 「記号」, or tokens made only of punctuation / symbols / spaces (Unicode `\p{P}\p{S}\s`, because kuromoji tags half-width `!?`, `%`, `♪` as nouns). These tokens have no tooltip, no hover highlight, and don't create wordcards.
- Caption position and size (`applyLayout`): from `captionPosition` (bottom / top), `captionOffset` (distance from edge, 0–50% of player height) and `captionSize` (70–200%), sets the overlay's CSS variables `--cw-offset`, `--cw-scale` and `.cw-at-top`. Caption text, POS labels, translation and box padding scale together; the tooltip and preview card don't. Bottom: 70px from the bottom (24px when controls are hidden) + offset; top: 60px from the top (16px when controls are hidden) + offset. Changes apply live.
- With captions at the top, the tooltip opens below the word; the preview card goes to whichever side of the word has more room (with `.cw-card-below` the arrow is on the card's top edge).
- Tooltip (replaces the old `title`): dictionary form + its reading, `POS・subcategory` and surface-reading tags, "Click to add a wordcard". Grammar units show 「〜たんだ」, a `Grammar・POS` tag and a components tag (た＋ん＋だ), and "Click to add as a grammar card".
- `toast(message, state)`: state is `loading` / `success` / `duplicate` / `warning` / `error`, each with its own icon and color; loading stays until replaced, others disappear after 2.5 s. The clicked word stays highlighted while the card is being created.
- `showCard(card, tokenEl)`: after a successful add, shows the preview card above the word (meaning, explanation, sentence, extra examples, timestamp link), centered on the word and kept inside the player; content scrolls when the player is too short. Closed by ✕, clicking outside, or a line change.
- Preview card timestamp: when the card's `videoId` matches the playing video, it seeks to that line (no page reload); for a different video it doesn't navigate and shows "This wordcard is from another video ({videoId}), can't jump there". Ctrl / Shift / middle click still opens a new tab.
- Duplicates, warnings and errors still use toasts; if the line has changed and the clicked word is gone, success also falls back to a toast.
### translationScheduler
Translates in chunks around playback, so long videos (20+ minutes) don't wait a long time for translations.
- Captions are grouped into chunks of 20 lines; only chunks covering "current position ~ 120 s ahead" are translated; parts never watched are never translated.
- Listens to the video's `timeupdate` / `seeking` / `play`: fetches the next chunk as playback advances, and starts from the new position's chunk on seek.
- At most 2 concurrent requests; a failure is retried once, and an error toast is shown once if it still fails.
- Changing the translation language, engine, LLM provider, or toggling translation only restarts translation without refetching captions; already translated lines come straight from the background cache.
### Translator
Translates whole caption lines (interface: `translateBatch(texts, targetLang, { title }) → string[]`).
- `GoogleTranslateProvider`: Google Translate public endpoint, no API key. Lines are joined with newlines into one request; if the line count doesn't match, it falls back to line-by-line. Ignores `title`.
- `GeminiTranslateProvider` / `NvidiaTranslateProvider` / `GroqTranslateProvider`: send a batch of lines to the LLM together as context and ask for `{"translations": [...]}` back; a bare array is accepted too. The prompt and parsing are shared in `translate/llmTranslatePrompt.js`.
- The prompt says the lines are speech or lyrics to be translated for meaning, not word for word, and includes the video title as background (read by `ytBridge` from the player data and passed to the background in the `translate` message), marked as reference only: don't translate it or rewrite lines to match it.
- NVIDIA / Groq translation calls turn off `strictJson` (see llmLib): their JSON mode requires an object at the top level, models often return an array anyway, and Groq rejects that with 400 `json_validate_failed`.
### translatorFactory
Picks the implementation: Google Translate when `translateProvider` is `google`; when it is `llm`, by `llmProvider` (`gemini` / `nvidia` / `groq`).
### WordcardInfoProvider
Generates wordcard info (interface: `getInfo(input, targetLang) → { meaning, reading, explanation, examples }`; `examples` are 2 extra LLM sentences `[{ sentence, translation }]`). When `input.kind` is `grammar`, `word` is the grammar itself (たら, たんだ) and `host` is the word it attaches to, and grammar card content is generated instead (see wordcardGenerator).
### wordcardInfoFactory
Picks the wordcard info implementation from `llmProvider` (`gemini` / `nvidia` / `groq`). Wordcards always use an LLM, the same provider translation uses when the engine is `llm`. All three providers share their prompts and response handling in `wordcard/llmWordcardPrompt.js`; each provider only calls its own client.
### wordcardGenerator
Builds a full wordcard: `{ id, type, word (dictionary form), surface, reading, pos, meaning, explanation, examples, sentence, sentenceTranslation, videoId, time, createdAt, host? }`.
- `type`: `word` wordcard, `grammar` grammar card (created when a grammar unit is clicked; `word` is the grammar itself, e.g. 「たら」, and `host` is the word it attaches to). Old cards without `type` are treated as wordcards.
- Grammar cards are generated by each provider's `getGrammarInfo`: `meaning` is the grammar's function in the sentence, `explanation` covers how it attaches, its nuance and its meaning in this sentence (each component explained when there are several), plus 2 example sentences.
- Grammar cards are shown with a leading 「〜」 (〜たら) and a "Grammar" POS tag; the circle in the popup list shows "G" (「文」 in Chinese); the Anki front is also 「〜たら」.
- Duplicates are checked per `type` (`findWordcard(word, type)`). The video is identified by `videoId` only, recorded at click time (so switching videos while waiting doesn't mislabel it). If the LLM fails (e.g. no API key), the basic data is still saved and a warning is returned.
### wordcardDB
Stores wordcards (`wordcards` in `chrome.storage.local`), de-duplicated by dictionary form + `type` (wordcards and grammar cards are counted separately).
### wordcardExporter
Exports wordcards in an Anki-importable format: UTF-8 TSV with `#separator:tab`, `#html:true` and `#columns:` headers; the word is bolded in sentences.
- Column order: `Front`, `Back`, `Word`, `Reading`, `Meaning`, `PartOfSpeech`, `Explanation`, `Sentence`, `SentenceTranslation`, `Source`, `Examples`.
- Anki's built-in Basic note type only has Front / Back and maps the first two columns in order, so these two are ready-made: `Front` = the word (large); `Back` has three labeled sections: **Reading**, **Meaning** (meaning + POS, explanation), **Examples** (the video sentence + extra examples, word in bold, each with its translation), then the YouTube link. Fixed font sizes with a clear hierarchy (reading 24px > meaning 19px > sentences 17px > explanation / translation 14px > labels / link 12–13px); secondary text is dimmed with opacity, so it works in dark and light mode. Section labels follow the UI language (中 / EN). Importing with Basic shows everything.
- The individual fields after them are for custom note types: map them to your own fields when importing and set unneeded ones to "Nothing".
### llmLib
LLM API clients.
- `geminiClient`: Gemini `generateContent`, supports JSON output (`responseMimeType`). Retries up to 8 times.
- `nvidiaClient`: NVIDIA API (`integrate.api.nvidia.com`, OpenAI-compatible), default model `meta/llama-3.3-70b-instruct`.
- `groqClient`: Groq API (`api.groq.com/openai/v1`, OpenAI-compatible), default model `llama-3.3-70b-versatile`.
- NVIDIA / Groq `generate(prompt, { json, strictJson })`: `strictJson` (on by default) sends `response_format: json_object`, forcing an object at the top level; when off it isn't sent and `parseJsonLoose` parses the reply itself (stripping \`\`\`json fences).
- `gptClient`: OpenAI Chat Completions (implemented, not yet wired to a provider).
### fetchRetry
Every LLM and Google Translate request goes through `fetchWithRetry(url, init, retryOptions)`:
- A 503 response, or `fetch()` itself throwing, is retried with exponential backoff: starting at 1 s, doubling, capped at 8 s, with random jitter; `Retry-After` is honored when present. Up to 4 retries by default, 8 for Gemini.
- Why network errors are retried: after an extension gets several 503s from the same URL, the browser temporarily blocks further requests (DevTools shows 0 bytes, 1 ms, no status), and JavaScript only sees "Failed to fetch". Gemini translation hits this easily when the model is overloaded.
- Other statuses (4xx etc.) are not retried; the response goes back to the caller.
### background
MV3 service worker. All outgoing network requests happen here (they need `host_permissions`, which include the Google Translate, Gemini, NVIDIA and Groq domains), and translations are cached. Messages: `translate`, `wordcard:add`, `wordcard:regenerate` (re-runs the LLM card by card for wordcards without `meaning`, stops at the first error, returns `{ fixed, error? }`).
- The translation cache key is `${engine}|${target language}|${text}`, where the engine is `google` or `llm-${llmProvider}`, so switching providers never returns another provider's translation.
- Translation errors are prefixed with the engine actually used, e.g. `[llm-gemini] Failed to fetch`.
### settings / popup
General settings are stored as `settings` in `chrome.storage.sync`: enabled, UI language `uiLang` (`zh-TW` / `en`, independent of the translation language), show translation, re-split sentences `sentenceSplit`, segmentation unit `tokenUnit` (word / stem + ending / phrase, default stem + ending), translation language (Traditional Chinese / English), translation engine `translateProvider` (`google` / `llm`), LLM provider `llmProvider` (`gemini` / `nvidia` / `groq`, default `gemini`), a model per provider `geminiModel` (default `gemini-3.1-flash-lite`) / `nvidiaModel` / `groqModel`, caption appearance (position `captionPosition`, distance from edge `captionOffset`, size `captionSize`), and which POS show their names.
- The two caption-appearance sliders only update the number while dragging and save on release: `storage.sync` limits writes per minute, and saving every step while dragging would exceed it.

The popup has two tabs (the last one is remembered):
- Settings: the header has the UI language switch (中 / EN) and the enable toggle; segmentation unit, translation language, translation engine and caption position use segmented buttons; POS use clickable chips. Section headings are bold.
- "Re-split sentences" is the round button to the right of the segmentation unit (`refresh-cw` icon, accent-colored when on, state in `aria-pressed`).
- "LLM (translation / wordcard generation)" section: a provider dropdown with a single API key field and a single model field below it, showing the current provider's values; switching providers swaps in that provider's saved values. The dropdown saves immediately; the text fields save on blur or Enter.
- Wordcards: the top shows how many cards failed to generate (no meaning) and a "Regenerate all" button; newest first, each showing POS, word, reading and meaning. **Clicking a card opens the full preview card** (same design as 1d on the video, built by `wordcardView.js`): word, reading, POS, full meaning, explanation, sentence, sentence translation, timestamp link (new tab) and delete. Cards without a meaning point to "Regenerate all". Closed by ✕, clicking the backdrop, or Esc; if regeneration updates the card, it refreshes live. Export and Clear all are at the bottom.
- The popup also loads `res/style/style.css` for the preview card styles (`.cw-card` carries its own color variables and doesn't depend on `.cw-overlay`).
### UI design (Organic)
Implemented from `doc/UI mockups form/design_handoff_caption_wordinizer_organic/README.md`, using variants 1a (captions + tooltip), 1c (toast), 1d (wordcard preview), 2a (settings tab) and 1h (wordcards tab).
- Colors: beige `#f5ead8` background, terracotta `#c67139` accent, sage green `#7a8a5e` for success.
- Fonts: Caprasimo (headings), Figtree (body), Huninn (Chinese), Zen Maru Gothic (Japanese). All bundled in `res/fonts/`; the popup links `fonts.css` directly, and the content script reads `fonts.css`, rewrites relative paths to `chrome-extension://` URLs and injects it into the YouTube page.
- Icons: Lucide (`src/common/icons.js`).
- Differences from the mockup: the model field default stays `gemini-3.1-flash-lite` (the mockup says `gemini-2.5-flash`); the preview card scrolls when the player is too short.
### secrets (API key storage)
- API keys are stored on their own in `chrome.storage.local`, one per provider: `geminiApiKey`, `nvidiaApiKey`, `groqApiKey`, separate from the general settings.
- On every start, the background calls `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`, so `local` (API keys, wordcards) is readable only by the background and popup, not content scripts.
- API keys are merged with settings only inside the background to call the LLM, and are never sent to content scripts.
- Limitation: `storage.local` is not encrypted on disk; anyone who can read the Chrome profile can get it. Restrict the key to the Gemini API in Google Cloud Console and set a usage quota.
- Old v0.1 settings (everything in `local.settings`) are split and migrated automatically when the background starts.

## Changelog
### 2026-09-28 — v0.1 first release
- All modules in the spec implemented: caption fetching, tokenizing, coloring, display, translation (Google / Gemini), wordcard generation / storage / Anki export, popup settings.
- Added `ytBridge.js` (MAIN world), `background.js` and `common/settings.js`; the architecture tree was updated.
- Bundled kuromoji 0.1.2 and its dictionary, generated `icon128.png`.
- Verified in Node: json3 parsing, kuromoji tokenizing and coloring, Anki TSV export, Google Translate (zh-TW / en).
- Not yet tested in Chrome: the YouTube caption download flow and the Gemini API (needs an API key).

### 2026-09-28 — Better API key storage
- The API key moved out of `settings` into `local.geminiApiKey` managed by `secrets.js`, and `storage.local` is restricted to extension pages; general settings moved to `storage.sync`.
- Default model is now `gemini-3.1-flash-lite`; a saved `gemini-2.5-flash` from older versions is reset to the default during migration.

### 2026-09-28 — Chunked translation for long videos
- Added `translationScheduler.js`: previously the whole video was translated in order from the current position (40 lines per batch, one batch at a time), so long videos took a long time and seeks had to wait in line. Now only 120 s ahead of the current position is translated (20-line chunks, 2 concurrent requests), and seeks take priority.
- Verified by simulating a 30-minute (600-line) video in Node: only the first 60 lines are translated at the start; after seeking to 20:00 the first request is for that position; watching a few parts translated only 140 lines in total.

### 2026-09-28 — Organic UI redesign
- Redesigned from the mockup: caption box, hover tooltip, toasts in four states, wordcard preview card, and a popup with Settings / Wordcards tabs.
- Added features the mockup had and the extension didn't: UI language switch (`uiLang`), dictionary-form reading in the tooltip (`basicReading`), wordcard preview with timestamp jump after adding, popup tabs and expandable cards, wordcard timestamp links, remembering the last tab.
- POS colors changed to three OKLCH sets (`POS_COLORS` / `POS_COLORS_LIGHT` / `POS_TINTS`); added `i18n.js`, `icons.js`, `popup.css`, and bundled fonts in `res/fonts/`.
- Checked with headless Chrome screenshots: popup (中 / EN, both tabs), tooltip, preview card and toasts.

### 2026-09-28 — Preview timestamp checks the video ID
- The preview card's timestamp compares the card's `videoId` with the playing video: it seeks only when they match; for a different video it shows a notice and does not navigate.
- Videos are identified by `videoId` only; titles and channels are not stored. `videoId` is recorded at click time.

### 2026-09-28 — Full preview card in the popup
- Clicking a card in the popup Wordcards tab now opens the full preview card (instead of expanding in place), showing the full meaning and explanation, with the timestamp link and delete.
- The preview card content moved into `src/common/wordcardView.js`, shared by the video overlay and the popup so both look the same.
- Fix: the "Regenerate all" click handler was registered inside `selectTab()`, adding another listener on every tab switch, so one click sent several requests; it's now registered once at the top level.

### 2026-09-28 — Strip bracket tags from captions
- `ccFetcher.parseJson3()` removes tags such as `[音楽]`, `[拍手]` and `［笑い］`; lines that contain only a tag are dropped, so tags no longer appear in tokenizing, translation or wordcards.
- Verified in Node: tag-only lines, tags at the start / middle / end, tags split across two segments, full-width brackets.

### 2026-09-28 — Split captions by punctuation
- Added `ccSegmenter.js`: sentences spanning several lines are merged and lines with several sentences are split, so each caption shows one sentence; translation also gets whole sentences.
- New "Split by punctuation" toggle in Settings (`sentenceSplit`, on by default); tracks with almost no punctuation keep their original lines.
- Verified in Node: cross-line merging, splitting multi-sentence lines, quotes, pause-based splitting, length limit, almost no punctuation.

### 2026-09-28 — Punctuation is not clickable
- Punctuation in captions (「」。、！？…♪ etc.) can no longer be clicked to add a wordcard, and shows no tooltip or highlight.
- Verified with kuromoji: `!?`, `%`, `♪` are tagged as nouns but are still detected as punctuation; ordinary words (including `ｗｗｗ`) stay clickable.

### 2026-09-28 — POS-based sentence splitting
- Checked real data first: downloaded captions of 6 videos with yt-dlp (2 have both manual and auto captions). Japanese auto captions **mostly have punctuation now**, and every word has a `tOffsetMs`.
- `ccFetcher` keeps auto-caption word timing (`words`); `ccSegmenter` was rewritten as "character stream + cut selection", and punctuation splitting uses word timing too, so auto-caption line changes are timed to the word instead of by character count.
- Added POS splitting (rules in the ccSegmenter section) for unpunctuated auto captions; unpunctuated manual captions are left as-is.
- Added the evaluation script `test/segmenter-eval.mjs` and `test/kuromojiNode.mjs`, and tuned rules and parameters on the results (threshold 3, min 4 characters, line boundary +2). Auto-caption F1 rose from 22.7% (original lines) to 73.1%.
- The setting is renamed "Re-split sentences" (still `sentenceSplit`).
- Not met: the planned precision goal was 80%; it's currently 69.7% (75.2% acceptable, i.e. cut at a sentence end or comma).

### 2026-09-28 — Caption position and size
- New "Caption appearance" settings: position (bottom / top), distance from edge (0–50%), size (70–200%), applied live to the playing video.
- With captions at the top, the tooltip opens below the word; the preview card picks its side by available space.
- Checked with headless Chrome screenshots: settings page, top + tooltip, top + preview card, bottom at 150%, bottom at 70% + preview card.

### 2026-09-28 — Anki export works with the Basic note type
- Problem: importing with Anki's built-in Basic note type maps only one column each to Front / Back, so the reading, meaning, POS, sentences etc. were missing.
- The first two columns are now a ready-made `Front` (word) and `Back` (reading, meaning, POS, explanation, sentence, translation, extra examples, link), so Basic works directly; the individual fields moved after them.
- Note: the column order changed; anyone who imported with a custom note type needs to set the field mapping again.

### 2026-09-28 — Anki card back redesign
- Problem: the back didn't label which part is the reading / meaning / examples, and meaning, explanation and sentences were about the same size, so there was no clear hierarchy.
- The back is split into labeled Reading / Meaning / Examples sections with thin dividers; fixed font sizes with a wider hierarchy, and a larger word on the front.

### 2026-09-28 — Segmentation unit and grammar cards
- Problem: IPADIC splits conjugations into tiny pieces (戻っ｜た｜ん｜だ｜よ｜ね), and POS labels are wider than a single character, so captions looked scattered.
- Added `tokenGrouper.js` and a "Segmentation" setting: word / **stem + ending** (default, 戻っ｜たんだ｜よね) / phrase (戻ったんだ｜よね).
- Particles, auxiliaries and endings are now "grammar": clicking one creates a grammar card (`type: "grammar"`), with Gemini explaining its function, how it attaches, its nuance and its meaning in the sentence, plus examples; the card is shown as 「〜たんだ」 with a "Grammar" tag. The tooltip shows the components (た＋ん＋だ).
- Katakana long vowels inside hiragana words are normalized before tokenizing (ぐルーって → ぐるーって), fixing 「なんか」 being split into 「な｜ん｜かぐ」.
- Tested grouping and normalization in Node, and checked all three modes and the grammar tooltip end to end in headless Chrome with the real kuromoji.

### 2026-09-29 — Multiple LLM providers, 503 retries, captions missing after refresh
- **LLM providers**: added `nvidiaClient`, `groqClient` and matching translation / wordcard providers. Settings are now "Translation engine: Google Translate / LLM" plus an "LLM provider" dropdown (`llmProvider`); wordcards and translation share the provider, and the old `wordcardProvider` setting was removed. Each provider keeps its own API key and model.
- **503 retries**: added `fetchRetry.js`; 503s and network failures are both retried with exponential backoff. Root cause of Gemini translation always failing with "Failed to fetch": `gemini-3.1-flash-lite` returned 503 often, after repeated 503s the browser temporarily blocked the extension's requests, and the old retry didn't handle that error.
- **Groq translation 400**: translation wants an array, but Groq's JSON mode requires an object at the top level and rejects an array (`json_validate_failed`). The prompt now asks for `{"translations": [...]}`, and NVIDIA / Groq translation turn off `strictJson`.
- **Captions missing after refreshing a watched video**: three causes, all fixed (see ytBridge, ccFetcher): the player's caption notification was missed, a URL without `pot` was recorded, and the player didn't re-request when captions were already on. Confirmed in Edge by refreshing two videos repeatedly.
- **Other**: switching the LLM provider re-translates right away (it used to compare only `translateProvider`); translation errors name the engine; "Re-split sentences" is now an icon button next to the segmentation unit; Settings headings are bold.
- Known issues (see wait-feat): with `strictJson` off, NVIDIA / Groq replies with extra text around the JSON fail to parse; clicking the "Re-split sentences" button twice quickly can lose one toggle.
