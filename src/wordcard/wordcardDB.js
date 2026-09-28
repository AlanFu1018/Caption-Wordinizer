// wordcardDB.js
// 用 chrome.storage.local 保存單字卡

const KEY = "wordcards";

async function getAllWordcards() {
    const stored = await chrome.storage.local.get(KEY);
    return stored[KEY] || [];
}

async function findWordcard(word) {
    return (await getAllWordcards()).find(c => c.word === word) || null;
}

async function addWordcard(card) {
    const cards = await getAllWordcards();
    cards.push(card);
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

export { getAllWordcards, findWordcard, addWordcard, removeWordcard, clearWordcards };
