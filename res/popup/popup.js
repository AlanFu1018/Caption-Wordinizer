// popup.js
// 設定頁面與單字卡管理

import { POS_LIST, TARGET_LANGUAGES, loadSettings, saveSettings } from "../../src/common/settings.js";
import { POS_COLORS } from "../../src/content/tokenColorizer.js";
import { getAllWordcards, removeWordcard, clearWordcards } from "../../src/wordcard/wordcardDB.js";
import { toAnkiTsv } from "../../src/wordcard/wordcardExporter.js";

const $ = (id) => document.getElementById(id);

async function initSettings() {
    const settings = await loadSettings();

    const langSelect = $("targetLang");
    for (const [code, name] of Object.entries(TARGET_LANGUAGES)) {
        langSelect.add(new Option(name, code));
    }

    for (const key of ["enabled", "showTranslation"]) {
        $(key).checked = settings[key];
        $(key).addEventListener("change", () => saveSettings({ [key]: $(key).checked }));
    }
    for (const key of ["targetLang", "translateProvider", "geminiApiKey", "geminiModel"]) {
        $(key).value = settings[key];
        $(key).addEventListener("change", () => saveSettings({ [key]: $(key).value.trim() }));
    }

    const grid = $("posLabels");
    for (const pos of POS_LIST) {
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = pos;
        box.checked = settings.posLabels.includes(pos);
        box.addEventListener("change", () => {
            const selected = [...grid.querySelectorAll("input:checked")].map(b => b.value);
            saveSettings({ posLabels: selected });
        });
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = POS_COLORS[pos];
        label.append(box, swatch, pos);
        grid.appendChild(label);
    }
}

async function renderCards() {
    const cards = await getAllWordcards();
    $("cardCount").textContent = cards.length;
    const list = $("cardList");
    list.textContent = "";
    for (const card of [...cards].reverse()) {
        const li = document.createElement("li");
        const word = document.createElement("span");
        word.textContent = card.reading && card.reading !== card.word ? `${card.word}（${card.reading}）` : card.word;
        const meaning = document.createElement("span");
        meaning.className = "meaning";
        meaning.textContent = card.meaning;
        meaning.title = card.meaning;
        const del = document.createElement("button");
        del.textContent = "✕";
        del.title = "刪除";
        del.addEventListener("click", async () => {
            await removeWordcard(card.id);
            renderCards();
        });
        li.append(word, meaning, del);
        list.appendChild(li);
    }
}

$("exportBtn").addEventListener("click", async () => {
    const cards = await getAllWordcards();
    if (!cards.length) return;
    const blob = new Blob([toAnkiTsv(cards)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `caption-wordinizer-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("clearBtn").addEventListener("click", async () => {
    if (!confirm("確定要刪除所有單字卡嗎？")) return;
    await clearWordcards();
    renderCards();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.wordcards) renderCards();
});

initSettings();
renderCards();
