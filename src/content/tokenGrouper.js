// tokenGrouper.js
// 把 kuromoji 的斷詞結果依「斷詞單位」分組成顯示單位。IPADIC 會把活用拆得很碎（戻っ｜た｜ん｜だ｜よ｜ね），
// 這裡依設定合併：
//   word   詞：        戻っ｜た｜ん｜だ｜よ｜ね（不合併）
//   stem   語幹＋語尾： 戻っ｜たんだ｜よね（單字和文法分開）
//   phrase 詞組：      戻ったんだ｜よね
// 每一組是 { tokens: [kuromoji token], kind: "word" | "grammar", head }：
//   word    = 單字（點了建立單字卡），head 是主要的自立語
//   grammar = 文法（助詞、助動詞、語尾，點了建立文法卡）

// 接在用言 / 名詞後面、屬於「語尾」的部分
const CONJ_PARTICLES = new Set(["て", "で", "ば", "ちゃ", "じゃ", "たり", "だり"]);

function isLongVowel(t) {
    return /^ー+$/.test(t.surface_form);
}

function isSentenceFinal(t) {
    // 終助詞（よ、ね、な…）；「か」在 IPADIC 是「副助詞／並立助詞／終助詞」
    return t.pos === "助詞" && (t.pos_detail_1 === "終助詞" || t.pos_detail_1 === "副助詞／並立助詞／終助詞");
}

function isEnding(tokens, k) {
    /*tokens[k] 是不是語尾的一部分：助動詞、補助動詞（いる、しまう…）、動詞接尾（れる、させる）、
      て / で / ば、以及「ん / の」+ 助動詞（〜んだ、〜のです）*/
    const t = tokens[k];
    if (t.pos === "助動詞") return true;
    if ((t.pos === "動詞" || t.pos === "形容詞") && (t.pos_detail_1 === "非自立" || t.pos_detail_1 === "接尾")) return true;
    if (t.pos === "助詞" && t.pos_detail_1 === "接続助詞" && CONJ_PARTICLES.has(t.surface_form)) return true;
    if (t.pos === "名詞" && t.pos_detail_1 === "非自立" && (t.surface_form === "ん" || t.surface_form === "の")) {
        const next = tokens[k + 1];
        return !!next && next.pos === "助動詞";
    }
    return false;
}

function isGrammar(t) {
    return t.pos === "助詞" || t.pos === "助動詞";
}

function groupTokens(tokens, unit = "stem") {
    const groups = [];
    const last = () => groups[groups.length - 1];

    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        const prev = last();

        // 長音「ー」被 kuromoji 單獨切出來時（ぐる｜ー），接回前一個
        if (isLongVowel(t) && prev) {
            prev.tokens.push(t);
            continue;
        }
        const ending = isEnding(tokens, k);
        if (unit === "word") {
            // 不合併；補助動詞（しまう、いる）、接尾（られる）、〜んだ 的「ん」也算文法
            groups.push({ tokens: [t], kind: isGrammar(t) || ending ? "grammar" : "word", head: t });
            continue;
        }

        const final = !ending && isSentenceFinal(t);
        const prevLastToken = prev && prev.tokens[prev.tokens.length - 1];

        if (ending) {
            // 詞組：語尾併進前面的單字；語幹＋語尾：連續的語尾併成一個文法單位
            if (unit === "phrase" && prev && prev.kind === "word") { prev.tokens.push(t); continue; }
            if (prev && prev.kind === "grammar" && prev.ending) { prev.tokens.push(t); continue; }
            groups.push({ tokens: [t], kind: "grammar", head: t, ending: true });
            continue;
        }
        if (final) {
            // 連續的終助詞併在一起（よね、かな）
            if (prev && prev.final && isSentenceFinal(prevLastToken)) { prev.tokens.push(t); continue; }
            groups.push({ tokens: [t], kind: "grammar", head: t, final: true });
            continue;
        }
        groups.push({ tokens: [t], kind: isGrammar(t) ? "grammar" : "word", head: t });
    }
    return groups.map(({ tokens: parts, kind, head }) => ({ tokens: parts, kind, head }));
}

export { groupTokens };
