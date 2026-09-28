# 待完成的功能 / Features not implemented yet
- [中文](#中文)
- [English](#english)

---
## 中文
- [ ] 在 Chrome 實機完整測試（YouTube 字幕下載、Gemini API、新 UI、文法卡）
- [ ] 將 `gptClient` 接上 `GptTranslateProvider` / `GptWordcardProvider`，並在設定頁選擇
- [x] 將「動詞 + 助動詞」等活用形合併成一個顯示單位 — 2026-09-28 完成（設定「斷詞單位」）
- [ ] 支援 YouTube Shorts 與內嵌播放器
- [x] 字幕字體大小、位置可調整（設計稿「Try next」建議）— 2026-09-28 完成
- [ ] 直接透過 AnkiConnect 新增卡片（不經過匯出檔），並在介面顯示同步狀態（設計稿「Try next」建議）
- [ ] 單字卡搜尋（設計稿 1g 有，但不在最終採用的版本中）
- [ ] 詞性斷句的精確率提升到 80%（目前 69.7%，見 doc/spec.md 的 ccSegmenter 評估），並增加更多自動字幕測試資料

---
## English
- [ ] Full end-to-end test in Chrome (YouTube caption download, Gemini API, new UI, grammar cards)
- [ ] Wire `gptClient` into `GptTranslateProvider` / `GptWordcardProvider` and make it selectable in Settings
- [x] Merge conjugations such as "verb + auxiliary" into one display unit — done 2026-09-28 ("Segmentation" setting)
- [ ] Support YouTube Shorts and embedded players
- [x] Adjustable caption size and position (mockup "Try next" suggestion) — done 2026-09-28
- [ ] Add cards directly through AnkiConnect (no export file) and show sync status in the UI (mockup "Try next" suggestion)
- [ ] Wordcard search (in mockup 1g, but not in the final picks)
- [ ] Raise POS-splitting precision to 80% (currently 69.7%, see the ccSegmenter evaluation in doc/spec.md) and add more auto-caption test data
