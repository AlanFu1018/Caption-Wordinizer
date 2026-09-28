// popup.js
// 設定頁面與單字卡管理（2a 設定 / 1h 單字卡）

import { POS_LIST, TARGET_LANGUAGES, loadSettings, saveSettings } from "../../src/common/settings.js";
import { getGeminiApiKey, setGeminiApiKey } from "../../src/common/secrets.js";
import { t } from "../../src/common/i18n.js";
import { icon } from "../../src/common/icons.js";
import { buildWordcardBody } from "../../src/common/wordcardView.js";
import { POS_COLORS_LIGHT, POS_TINTS, colorOf } from "../../src/content/tokenColorizer.js";
import { getAllWordcards, removeWordcard, clearWordcards, isFailedWordcard } from "../../src/wordcard/wordcardDB.js";
import { toAnkiTsv } from "../../src/wordcard/wordcardExporter.js";

const $ = (id) => document.getElementById(id);
const TAB_KEY = "popupTab";

let settings = null;
let openCardId = null;        // 目前跳出預覽卡的單字卡
let regenerating = false;

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
    for (const key of ["enabled", "showTranslation", "sentenceSplit"]) {
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
function buildCardItem(card) {
    const item = el("button", "card-item");
    item.type = "button";

    const posCircle = el("span", "card-pos", (card.pos || "?")[0]);
    posCircle.style.background = colorOf(card.pos, POS_TINTS);
    posCircle.style.color = colorOf(card.pos, POS_COLORS_LIGHT);
    const main = el("span", "card-main");
    const title = el("span", "card-title");
    title.append(el("span", "card-word", card.word));
    if (card.reading && card.reading !== card.word) title.append(el("span", "card-reading", card.reading));
    main.append(title, el("span", "card-meaning", card.meaning || ""));
    item.append(posCircle, main);

    // 點卡片跳出完整預覽卡
    item.addEventListener("click", () => openCardModal(card, item));
    return item;
}

// ── 完整預覽卡 ──
let modalReturnFocus = null;

function openCardModal(card, returnFocus) {
    const modal = $("cardModal");
    modalReturnFocus = returnFocus || null;
    openCardId = card.id;

    const node = el("div", "cw-card");
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", card.word);
    node.append(buildWordcardBody(card, {
        lang: settings.uiLang,
        onClose: closeCardModal,
        newTab: true,   // popup 裡的時間連結開新分頁
        onDelete: async (c) => {
            await removeWordcard(c.id);
            closeCardModal();
            renderCards();
        },
    }));

    modal.textContent = "";
    modal.append(node);
    modal.hidden = false;
    // popup 的高度跟著內容走，卡片比清單高時要撐開，否則會被切掉
    document.body.style.minHeight = `${node.offsetHeight + 32}px`;
    node.querySelector(".cw-card-close").focus();
}

function closeCardModal() {
    const modal = $("cardModal");
    if (modal.hidden) return;
    modal.hidden = true;
    modal.textContent = "";
    openCardId = null;
    document.body.style.minHeight = "";
    if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus();
    modalReturnFocus = null;
}

// 點背景（卡片以外）或按 Esc 關閉
$("cardModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeCardModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCardModal();
});

async function renderCards() {
    const cards = (await getAllWordcards()).reverse();   // 最新的在最上面

    // 開著的卡片被補生成更新時，重新顯示最新內容；被刪掉就關閉
    if (openCardId) {
        const current = cards.find(c => c.id === openCardId);
        if (!current) closeCardModal();
        else if (!$("cardModal").hidden) openCardModal(current, modalReturnFocus);
    }

    $("cardCount").textContent = cards.length;
    $("cardsEmpty").hidden = cards.length > 0;
    $("exportBtn").disabled = cards.length === 0;
    $("clearBtn").disabled = cards.length === 0;

    const failed = cards.filter(isFailedWordcard).length;
    $("failedCount").textContent = failed;
    $("regenerateBtn").disabled = regenerating || failed === 0;

    const list = $("cardList");
    list.textContent = "";
    for (const card of cards) list.appendChild(buildCardItem(card));
}

// 補生成在 background 跑，popup 關掉也會繼續；每補好一張 storage 變動就會更新上面的數字
$("regenerateBtn").addEventListener("click", async () => {
    const status = $("regenerateStatus");
    regenerating = true;
    $("regenerateBtn").disabled = true;
    status.hidden = false;
    status.textContent = str("regenerating");
    try {
        const res = await chrome.runtime.sendMessage({ type: "wordcard:regenerate" });
        if (!res?.ok) throw new Error(res?.error || "unknown error");
        status.textContent = res.error
            ? str("regenerateFailed", { fixed: res.fixed, message: res.error })
            : str("regenerateDone", { fixed: res.fixed });
    } catch (e) {
        status.textContent = str("regenerateFailed", { fixed: 0, message: e.message });
    } finally {
        regenerating = false;
        renderCards();
    }
});

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
