> # 語言 / Language
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
- 滑鼠停在單字上可看到讀音與原形；**點一下單字**就會加入單字卡。
- 在擴充功能的設定頁可以：開關功能、切換翻譯語言與引擎、選擇要顯示名稱的詞性。
- 單字卡匯出：設定頁點「匯出 Anki」取得 `.txt`，在 Anki 選「檔案 → 匯入」即可（欄位：單字、讀音、意思、詞性、說明、例句、例句翻譯、影片連結）。

## 開發紀錄
- **2026-09-28 v0.1**：完成 [spec](doc/spec.md) 中所有模組（字幕抓取、斷詞、上色、顯示、翻譯、單字卡、Anki 匯出、設定頁）。詳細內容見 [spec 的完成紀錄](doc/spec.md#完成紀錄)，尚未完成的項目見 [wait-feat](doc/wait-feat.md)。
- **2026-09-28**：API Key 改為單獨保存，content script 讀不到；預設模型改為 `gemini-3.1-flash-lite`。
- **2026-09-28**：長影片分段翻譯，只翻目前播放位置往後約 2 分鐘，跳轉時新位置優先，20 分鐘以上的影片也能馬上看到翻譯。

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
- Hover a word to see its reading and dictionary form; **click it** to add it as a wordcard.
- In the popup you can toggle the extension, choose the target language and translation engine, and pick which parts of speech show their names.
- Export: click **匯出 Anki** in the popup to download a `.txt` file, then use **File → Import** in Anki.

## Changelog
- **2026-09-28 v0.1**: all modules in the [spec](doc/spec.md) implemented. See the spec's changelog for details and [wait-feat](doc/wait-feat.md) for what's left.
- **2026-09-28**: the API key is stored separately and content scripts can't read it; default model is now `gemini-3.1-flash-lite`.
- **2026-09-28**: chunked translation for long videos, which only translates ~2 minutes ahead of playback and follows seeks.
