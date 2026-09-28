// wordcardDB.js
// 用 chrome.storage.local 保存單字卡

const KEY = "wordcards";

// 沒有字義的卡片就是 LLM 生成失敗的
const isFailedWordcard = (card) => !card.meaning;

async function getAllWordcards() {
    const stored = await chrome.storage.local.get(KEY);
    return stored[KEY] || [];
}

async function findWordcard(word, type = "word") {
    // 單字卡和文法卡分開算重複（舊的卡片沒有 type，視為單字卡）
    return (await getAllWordcards()).find(c => c.word === word && (c.type || "word") === type) || null;
}

async function addWordcard(card) {
    const cards = await getAllWordcards();
    cards.push(card);
    await chrome.storage.local.set({ [KEY]: cards });
    return card;
}

async function updateWordcard(card) {
    const cards = await getAllWordcards();
    const i = cards.findIndex(c => c.id === card.id);
    if (i < 0) return null;   // 生成期間被刪掉了
    cards[i] = card;
    await chrome.storage.local.set({ [KEY]: cards });
    return card;
}

async function removeWordcard(id) {
    const cards = (await getAllWordcards()).filter(c => c.id !== id);
    await chrome.storage.local.set({ [KEY]: cards });
}

async function clearWordcards() {
    await chrome.storage.local.set({ [KEY]: [] });
}

export { isFailedWordcard, getAllWordcards, findWordcard, addWordcard, updateWordcard, removeWordcard, clearWordcards };
