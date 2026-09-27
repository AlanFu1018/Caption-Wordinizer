# File Structure of the Project

```
caption-wordinizer/
├── manifest.json
├── doc/
│   ├── spec.md
│   └── wait-feat.md
│
├── src/
│   ├── content/
│   │   ├── content.js                  # 進入點，串起 fetcher → tokenizer → colorizer → displayer
│   │   ├── ccFetcher.js                # 抓取當前字幕行 + 時間戳
│   │   ├── ccTokenizer.js              # 呼叫 kuromoji，輸出 [{surface, pos, reading}, ...]
│   │   ├── tokenColorizer.js           # 依 pos 包上 <span class="pos-xxx">
│   │   └── ccDisplayer.js              # 把上色結果 + 翻譯插入畫面 DOM，監聽點擊事件
│   │
│   ├── translate/
│   │   ├── Translator.js               # abstract: translate(text, targetLang) -> Promise<string>
│   │   ├── translatorFactory.js        # 讀使用者設定 → 回傳對應 Translator 實例
│   │   └── provider/
│   │       ├── GoogleTranslateProvider.js
│   │       └── GeminiTranslateProvider.js
│   │
│   ├── wordcard/
│   │   ├── WordcardInfoProvider.js     # abstract: generate(word, context) -> {meaning, example, ...}
│   │   ├── generatorFactory.js         # 讀使用者設定 → 回傳對應 WordcardInfoProvider 實例
│   │   ├── wordcardGenerator.js        # 協調流程：拿 provider 輸出 + 使用者點擊資訊 → 組成 wordcard
│   │   ├── wordcardDB.js               # chrome.storage 存取：add / getAll / remove / clear
│   │   ├── wordcardExporter.js         # 輸出 CSV，欄位對應 Anki 匯入格式
│   │   └── provider/
│   │       └── GeminiWordcardProvider.js
│   │
│   ├── lib/
│   │   ├── geminiClient.js             # callGemini(prompt) -> Promise<string>
│   │   └── gptClient.js                # callGPT(prompt) -> Promise<string>（之後新增 provider 時才建立）
│   │
│   ├── background.js                   # service worker，跨分頁狀態、必要時代發 API 請求
│   │
│   └── popup/
│       ├── popup.html                  # 開關、語言選擇、provider 選擇、匯出按鈕
│       └── popup.js
│
├── style/
│   └── style.css                       # 詞性顏色、字幕排版
│
├── lib-vendor/
│   └── kuromoji/                       # 第三方斷詞函式庫 + 字典檔
│
└── icons/
    └── icon128.png
```
# Style
# Module design
## CC fetcher
## CC tokenizer
## token colorizer
## CC translater
## CC displayer
## wordcard generator
## wordcard collection database
## wordcard collection exporter 
## llm api