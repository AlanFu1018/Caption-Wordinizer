# 目次 / Table of contents
- [中文說明]()
- [English Description]()
---
# 中文
## 這個專案的架構

```
caption-wordinizer/
├── manifest.json
├── doc/
│   ├── spec.md
│   └── wait-feat.md
│
├── src/
│   ├── content/
│   │   ├── content.js
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
│   └── lib/
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
        └── kuromoji/
```
## 模組設計
### ccFetcher
一次性抓取該影片所有字幕
### ccTokenizer
將所有字幕，處理詞性切割
### tokenColorizer
將不同詞性的字幕上色
### ccDisplayer
將所有部分組裝顯示
### Translator
將所有字幕整句翻譯
### translatorFactory
選擇具體的翻譯實作
### WordCardInfoProvider
將單字卡的資訊生成
### wordcardInfoFactory
選擇具體用哪一個 llm 的實作生成單字卡資訊
### wordcardGenerator
產生完整單字卡
### wordcardDB
保存單字卡
### wordcardExporter
將單字卡依照anki支援的格式匯出
### llmLib
存放llm呼叫的api