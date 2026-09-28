// popup.js
// 設定頁面與單字卡管理（2a 設定 / 1h 單字卡）

import { POS_LIST, TARGET_LANGUAGES, loadSettings, saveSettings } from "../../src/common/settings.js";
import { getGeminiApiKey, setGeminiApiKey } from "../../src/common/secrets.js";
import { t, formatTime, videoUrl } from "../../src/common/i18n.js";
import { icon } from "../../src/common/icons.js";
import { POS_COLORS_LIGHT, POS_TINTS, colorOf } from "../../src/content/tokenColorizer.js";
import { getAllWordcards, removeWordcard, clearWordcards } from "../../src/wordcard/wordcardDB.js";
import { toAnkiTsv } from "../../src/wordcard/wordcardExporter.js";

const $ = (id) => document.getElementById(id);
const TAB_KEY = "popupTab";

let settings = null;
let openCardId = undefined;   // undefined = 還沒選過，預設展開最新一張

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

const str = (key, vars) => t(settings.uiLang, key, vars);

async function update(patch) {
    settings = await saveSettings(patch);
}

// ── 介面語言 ──
function applyLanguage() {
    document.documentElement.lang = settings.uiLang === "en" ? "en" : "zh-Hant";
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = str(node.dataset.i18n);
    for (const node of document.querySelectorAll("[data-i18n-label]")) node.setAttribute("aria-label", str(node.dataset.i18nLabel));
    for (const btn of document.querySelectorAll("[data-ui-lang]")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.uiLang === settings.uiLang));
    }
    renderCards();
}

// ── 分頁 ──
function selectTab(name) {
    for (const tab of document.querySelectorAll(".tab")) {
        tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
    }
    for (const view of document.querySelectorAll(".view")) view.hidden = view.dataset.view !== name;
    try {
        chrome.storage.local.set({ [TAB_KEY]: name });
    } catch (e) { /* 記住分頁只是方便用，失敗就算了 */ }
}

// ── 2a 設定 ──
function buildSegmented(container, name, options, value, onChange) {
    container.textContent = "";
    for (const [optValue, label] of options) {
        const opt = el("label", "seg-opt");
        const input = el("input");
        input.type = "radio";
        input.name = name;
        input.value = optValue;
        input.checked = optValue === value;
        input.addEventListener("change", () => onChange(optValue));
        opt.append(input, label);
        container.appendChild(opt);
    }
}

function renderPosChips() {
    const grid = $("posLabels");
    grid.textContent = "";
    for (const pos of POS_LIST) {
        const selected = settings.posLabels.includes(pos);
        const chip = el("button", "pos-chip");
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(selected));
        chip.style.background = selected ? colorOf(pos, POS_TINTS) : "transparent";
        const dot = el("span", "pos-dot");
        dot.style.background = colorOf(pos, POS_COLORS_LIGHT);
        chip.append(dot, pos);
        chip.addEventListener("click", async () => {
            const next = selected ? settings.posLabels.filter(p => p !== pos) : [...settings.posLabels, pos];
            await update({ posLabels: POS_LIST.filter(p => next.includes(p)) });
            renderPosChips();
        });
        grid.appendChild(chip);
    }
}

async function initSettings() {
    for (const key of ["enabled", "showTranslation"]) {
        $(key).checked = settings[key];
        $(key).addEventListener("change", () => update({ [key]: $(key).checked }));
    }

    buildSegmented($("targetLang"), "targetLang", Object.entries(TARGET_LANGUAGES), settings.targetLang,
        (value) => update({ targetLang: value }));
    for (const input of document.querySelectorAll('input[name="translateProvider"]')) {
        input.checked = input.value === settings.translateProvider;
        input.addEventListener("change", () => update({ translateProvider: input.value }));
    }

    $("geminiModel").value = settings.geminiModel;
    $("geminiModel").addEventListener("change", () => update({ geminiModel: $("geminiModel").value.trim() }));

    // API Key 另外存，不放在會被 content script 讀到的設定裡
    $("geminiApiKey").value = await getGeminiApiKey();
    $("geminiApiKey").addEventListener("change", () => setGeminiApiKey($("geminiApiKey").value.trim()));

    for (const btn of document.querySelectorAll("[data-ui-lang]")) {
        btn.addEventListener("click", async () => {
            await update({ uiLang: btn.dataset.uiLang });
            applyLanguage();
        });
    }

    renderPosChips();
}

// ── 1h 單字卡 ──
function buildSentence(card) {
    const node = el("span", "card-sentence");
    const hit = card.surface ? card.sentence.indexOf(card.surface) : -1;
    if (hit >= 0) {
        node.append(card.sentence.slice(0, hit), el("b", null, card.surface), card.sentence.slice(hit + card.surface.length));
    } else {
        node.textContent = card.sentence;
    }
    return node;
}

function buildCardItem(card) {
    const open = card.id === openCardId;
    const item = el("div", "card-item" + (open ? " open" : ""));

    const row = el("div", "card-row");
    const posCircle = el("span", "card-pos", (card.pos || "?")[0]);
    posCircle.style.background = colorOf(card.pos, POS_TINTS);
    posCircle.style.color = colorOf(card.pos, POS_COLORS_LIGHT);
    const main = el("div", "card-main");
    const title = el("span", "card-title");
    title.append(el("span", "card-word", card.word));
    if (card.reading && card.reading !== card.word) title.append(el("span", "card-reading", card.reading));
    main.append(title, el("span", "card-meaning", card.meaning || ""));
    row.append(posCircle, main);
    item.append(row);

    // 點卡片切換展開；一次只展開一張
    item.addEventListener("click", () => {
        openCardId = open ? null : card.id;
        renderCards();
    });

    if (open) {
        const detail = el("div", "card-detail");
        detail.addEventListener("click", e => e.stopPropagation());
        detail.append(buildSentence(card));
        if (card.sentenceTranslation) detail.append(el("span", "card-sentence-tr", card.sentenceTranslation));

        const actions = el("div", "card-actions");
        if (card.videoId) {
            const link = el("a", "card-time");
            link.href = videoUrl(card.videoId, card.time);
            link.target = "_blank";
            link.rel = "noopener";
            if (card.videoTitle) link.title = card.channelName ? `${card.videoTitle}（${card.channelName}）` : card.videoTitle;
            link.innerHTML = icon("play", 12);
            link.append(formatTime(card.time));
            actions.append(link);
        }
        const del = el("button", "card-delete");
        del.type = "button";
        del.innerHTML = icon("trash-2", 13);
        del.append(str("delete"));
        del.addEventListener("click", async () => {
            await removeWordcard(card.id);
            openCardId = null;
            renderCards();
        });
        actions.append(del);
        detail.append(actions);
        item.append(detail);
    }
    return item;
}

async function renderCards() {
    const cards = (await getAllWordcards()).reverse();   // 最新的在最上面
    if (openCardId === undefined) openCardId = cards[0]?.id ?? null;

    $("cardCount").textContent = cards.length;
    $("cardsEmpty").hidden = cards.length > 0;
    $("exportBtn").disabled = cards.length === 0;
    $("clearBtn").disabled = cards.length === 0;

    const list = $("cardList");
    list.textContent = "";
    for (const card of cards) list.appendChild(buildCardItem(card));
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
    if (!confirm(str("clearConfirm"))) return;
    await clearWordcards();
    renderCards();
});

for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.wordcards) renderCards();
});

(async function init() {
    settings = await loadSettings();
    document.querySelector('[data-icon="download"]').innerHTML = icon("download", 15);
    await initSettings();
    applyLanguage();
    let tab = "settings";
    try {
        tab = (await chrome.storage.local.get(TAB_KEY))[TAB_KEY] || tab;
    } catch (e) { /* 用預設分頁 */ }
    selectTab(tab);
})();
