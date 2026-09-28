![image](doc/cover.png)
> > # 語言 / Language
> - [中文說明](#日文字幕單字分詞顯示工具)
> - [English Description](#caption-wordinizer)


---

# 日文字幕單字分詞顯示工具
## 目次
- [規格和設計](doc/spec.md)
- [待完成的功能](doc/wait-feat.md)
- [這是什麼](#這是什麼)
- [安裝教學](#安裝教學)
- [使用方式](#使用方式)
- [開發紀錄](#開發紀錄)


## 這是什麼?
這是一款能幫助您學習與理解日文的 Chrome 擴充功能：

1. 它會使用分詞器（tokenizer），根據日文單字的詞性將字幕進行斷詞。
2. 每個**斷詞段落都會根據其詞性標上不同的顏色**。
3. 您可以自由切換是否要**顯示特定的詞性名稱**。
4. 只要您願意，可以**將任何特定的單字加入成為您的單字卡**。
5. 新增的單字卡可以匯出，並**匯入至 Anki 中**。
6. 除了原始字幕外，您還能即時**看到該句字幕的完整翻譯**。
7. 目前共有兩種目標翻譯語言可供選擇（繁體中文、English）。

## 安裝教學
1. 下載或 `git clone` 這個專案。
2. 在 Chrome 開啟 `chrome://extensions`，打開右上角的「開發人員模式」。
3. 點「載入未封裝項目」，選擇專案根目錄（有 `manifest.json` 的資料夾）。
4. （選用）點擴充功能圖示，填入 [Gemini API Key](https://aistudio.google.com/apikey)。單字卡的字義與 Gemini 翻譯需要它；Google 翻譯不需要。

## 使用方式
- 打開一支有日文字幕（人工或自動產生）的 YouTube 影片，上色後的字幕會取代原本的字幕。
- 滑鼠停在單字上會出現提示框（原形、原形讀音、詞性、讀音）；**點一下單字**就會加入單字卡，加入後會在單字上方顯示單字卡預覽，點預覽卡的時間可跳回該句。
- 擴充功能的「設定」分頁：開關功能、切換介面語言（中 / EN）、翻譯語言與引擎、字幕位置與大小、選擇要顯示名稱的詞性。
- 「單字卡」分頁：點卡片會跳出完整預覽卡（意思、說明、例句、翻譯、影片時間連結），可單張刪除。
- 單字卡匯出：「單字卡」分頁點「匯出 Anki (.txt)」，在 Anki 選「檔案 → 匯入」即可（欄位：單字、讀音、意思、詞性、說明、例句、例句翻譯、影片連結）。

## 開發紀錄
- **2026-09-28 v0.1**：完成 [spec](doc/spec.md) 中所有模組（字幕抓取、斷詞、上色、顯示、翻譯、單字卡、Anki 匯出、設定頁）。詳細內容見 [spec 的完成紀錄](doc/spec.md#完成紀錄)，尚未完成的項目見 [wait-feat](doc/wait-feat.md)。
- **2026-09-28**：API Key 改為單獨保存，content script 讀不到；預設模型改為 `gemini-3.1-flash-lite`。
- **2026-09-28**：長影片分段翻譯，只翻目前播放位置往後約 2 分鐘，跳轉時新位置優先，20 分鐘以上的影片也能馬上看到翻譯。
- **2026-09-28**：依 `doc/UI mockups form` 的 Organic 設計改版字幕、提示框、toast、單字卡預覽與設定頁，新增介面語言切換（中 / EN），字型改為內附。
- **2026-09-28**：預覽卡的時間連結以 videoId 判斷影片，只在同一支影片時跳轉，不同影片會顯示提示。
- **2026-09-28**：popup 點單字卡會跳出完整預覽卡（和影片上的同一個樣式）。
- **2026-09-28**：字幕中的 `[音楽]`、`[拍手]` 等方括號標籤會自動刪除。
- **2026-09-28**：依標點符號重新斷句，一句一行顯示（設定頁「依標點斷句」可關閉）。
- **2026-09-28**：字幕中的標點符號不可點擊，不會被加入單字卡。
- **2026-09-28**：沒有標點的自動字幕改用詞性＋停頓斷句；自動字幕的換句時間精確到詞。設定改名為「重新斷句」。
- **2026-09-28**：新增字幕位置（下方 / 上方、距離邊緣）與大小設定。

---

# Caption-Wordinizer
## Table of contents
- [The design and spec of this extension](doc/spec.md)
- [Features that has NOT been implemented yet](doc/wait-feat.md)

## What is it?
It's a chrome extension that can help you learn and understand Japanese.
1. It will use tokenizer to segment caption by the form of japanese words.
2. Each **segments will be colorized** according to their forms.
3. You can toggle if you want to **display a specific form name** or not.
4. You can **add any specific word as your wordcard** if you want to.
5. Wordcards you added can be exported and be **imported to Anki**.
6. In addition to the original caption, you'll also **see the complete translation of that line** in real time.
7. There are now currently two target translation language you can choose from (Traditional Chinese, English).

## Setup Guide
1. Download or `git clone` this repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the project root (the folder containing `manifest.json`).
4. (Optional) Open the extension popup and enter a [Gemini API key](https://aistudio.google.com/apikey). It is needed for wordcard meanings and Gemini translation; Google Translate works without it.

## Usage
- Open a YouTube video with Japanese captions (manual or auto-generated). The colored captions replace the native ones.
- Hover a word for a tooltip (dictionary form and its reading, part of speech, reading); **click it** to add it as a wordcard. A preview of the new card appears above the word, and its timestamp jumps back to that line.
- Popup **Settings** tab: toggle the extension, switch the UI language (中 / EN), choose the target language and translation engine, set caption position and size, and pick which parts of speech show their names.
- Popup **Wordcards** tab: click a card to open its full preview card (meaning, explanation, sentence, translation, timestamp link), or delete it.
- Export: click **Export Anki (.txt)** in the Wordcards tab, then use **File → Import** in Anki.

## Changelog
- **2026-09-28 v0.1**: all modules in the [spec](doc/spec.md) implemented. See the spec's changelog for details and [wait-feat](doc/wait-feat.md) for what's left.
- **2026-09-28**: the API key is stored separately and content scripts can't read it; default model is now `gemini-3.1-flash-lite`.
- **2026-09-28**: chunked translation for long videos, which only translates ~2 minutes ahead of playback and follows seeks.
- **2026-09-28**: Organic redesign (from `doc/UI mockups form`) of the caption overlay, tooltip, toasts, wordcard preview and popup; added a UI language switch (中 / EN) and bundled fonts.
- **2026-09-28**: the preview card's timestamp checks the video ID; it only seeks within the same video and shows a notice otherwise.
- **2026-09-28**: clicking a wordcard in the popup opens the full preview card (same design as on the video).
- **2026-09-28**: bracket tags such as `[音楽]` and `[拍手]` are removed from captions.
- **2026-09-28**: captions are re-split at punctuation so each line is one sentence (toggle "Split by punctuation" in Settings).
- **2026-09-28**: punctuation in captions is no longer clickable and can't be added as a wordcard.
- **2026-09-28**: unpunctuated auto captions are split into sentences by part of speech and pauses; auto-caption timing is now word-accurate. The setting is now "Re-split sentences".
- **2026-09-28**: added caption position (bottom / top, distance from edge) and size settings.
