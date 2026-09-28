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
- [ ] NVIDIA / Groq 翻譯的 JSON 解析更耐用：模型在 JSON 前後多寫說明文字時，改為抓出第一段 `{…}` 或 `[…]` 再解析（目前只會拆掉 \`\`\`json 圍欄）
- [ ] 「重新斷句」按鈕快速連點會漏掉一次切換：點擊時先翻轉按鈕狀態，再用這個值儲存
- [x] 翻譯 prompt 加上「這是口語 / 歌詞字幕，可以意譯」的提示與影片標題，改善歌詞被逐字直譯的問題（例：「海を脱いで」被翻成「脫去海」）— 2026-09-29 完成，效果待實測
- [ ] 實機確認 Groq 與 NVIDIA 的翻譯與單字卡（Gemini 已在 Edge 實測過；Groq 關閉 `strictJson` 的修正還沒確認）

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
- [ ] More robust JSON parsing for NVIDIA / Groq translation: when the model writes extra text around the JSON, extract the first `{…}` or `[…]` before parsing (currently only \`\`\`json fences are stripped)
- [ ] Clicking the "Re-split sentences" button twice quickly can lose one toggle: flip the button state on click and save that value
- [x] Add a hint to the translation prompt that lines are casual speech / lyrics and may be translated freely, plus the video title, so lyrics aren't translated word for word (e.g. 「海を脱いで」 became 「脫去海」) — done 2026-09-29, effect not yet tested
- [ ] Confirm Groq and NVIDIA translation and wordcards in a real browser (Gemini was tested in Edge; the Groq `strictJson` fix hasn't been confirmed yet)
