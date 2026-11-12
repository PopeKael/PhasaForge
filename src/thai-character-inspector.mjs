const consonants = [
  ["ก", "ก ไก่", "ko kai", "k", "k"], ["ข", "ข ไข่", "kho khai", "kh", "k"], ["ฃ", "ฃ ขวด", "kho khuat", "kh", "k"], ["ค", "ค ควาย", "kho khwai", "kh", "k"], ["ฅ", "ฅ คน", "kho khon", "kh", "k"], ["ฆ", "ฆ ระฆัง", "kho ra-khang", "kh", "k"], ["ง", "ง งู", "ngo ngu", "ng", "ng"],
  ["จ", "จ จาน", "cho chan", "ch", "t"], ["ฉ", "ฉ ฉิ่ง", "cho ching", "ch", "t"], ["ช", "ช ช้าง", "cho chang", "ch", "t"], ["ซ", "ซ โซ่", "so so", "s", "t"], ["ฌ", "ฌ เฌอ", "cho choe", "ch", "t"], ["ญ", "ญ หญิง", "yo ying", "y", "n"],
  ["ฎ", "ฎ ชฎา", "do cha-da", "d", "t"], ["ฏ", "ฏ ปฏัก", "to pa-tak", "t", "t"], ["ฐ", "ฐ ฐาน", "tho than", "th", "t"], ["ฑ", "ฑ มณโฑ", "tho montho", "th", "t"], ["ฒ", "ฒ ผู้เฒ่า", "tho phu-thao", "th", "t"], ["ณ", "ณ เณร", "no nen", "n", "n"],
  ["ด", "ด เด็ก", "do dek", "d", "t"], ["ต", "ต เต่า", "to tao", "t", "t"], ["ถ", "ถ ถุง", "tho thung", "th", "t"], ["ท", "ท ทหาร", "tho thahan", "th", "t"], ["ธ", "ธ ธง", "tho thong", "th", "t"], ["น", "น หนู", "no nu", "n", "n"],
  ["บ", "บ ใบไม้", "bo bai-mai", "b", "p"], ["ป", "ป ปลา", "po pla", "p", "p"], ["ผ", "ผ ผึ้ง", "pho phueng", "ph", "p"], ["ฝ", "ฝ ฝา", "fo fa", "f", "p"], ["พ", "พ พาน", "pho phan", "ph", "p"], ["ฟ", "ฟ ฟัน", "fo fan", "f", "p"], ["ภ", "ภ สำเภา", "pho sam-phao", "ph", "p"],
  ["ม", "ม ม้า", "mo ma", "m", "m"], ["ย", "ย ยักษ์", "yo yak", "y", "y"], ["ร", "ร เรือ", "ro ruea", "r", "n"], ["ล", "ล ลิง", "lo ling", "l", "n"], ["ว", "ว แหวน", "wo waen", "w", "w"], ["ศ", "ศ ศาลา", "so sala", "s", "t"], ["ษ", "ษ ฤๅษี", "so ruesi", "s", "t"], ["ส", "ส เสือ", "so suea", "s", "t"],
  ["ห", "ห หีบ", "ho hip", "h", null], ["ฬ", "ฬ จุฬา", "lo chula", "l", "n"], ["อ", "อ อ่าง", "o ang", "vowel carrier", null], ["ฮ", "ฮ นกฮูก", "ho nok-huk", "h", null],
];

const consonantClasses = Object.freeze({
  high: new Set(["ข", "ฃ", "ฉ", "ฐ", "ถ", "ผ", "ฝ", "ศ", "ษ", "ส", "ห"]),
  middle: new Set(["ก", "จ", "ฎ", "ฏ", "ด", "ต", "บ", "ป", "อ"]),
  low: new Set(["ค", "ฅ", "ฆ", "ง", "ช", "ซ", "ฌ", "ญ", "ฑ", "ฒ", "ณ", "ท", "ธ", "น", "พ", "ฟ", "ภ", "ม", "ย", "ร", "ล", "ว", "ฬ", "ฮ"]),
});

const vowels = [
  ["ะ", "สระอะ", "sara a", "Short a vowel sign, written after its consonant."],
  ["ั", "ไม้หันอากาศ", "mai han akat", "Above-consonant sign used in short-vowel spellings; it has no separate consonant sound."],
  ["า", "สระอา", "sara aa", "Long aa vowel sign, written after its consonant."],
  ["ำ", "สระอำ", "sara am", "Combined am vowel sign; read the sign as a whole."],
  ["ิ", "สระอิ", "sara i", "Short i vowel sign, positioned above its consonant."],
  ["ี", "สระอี", "sara ii", "Long ee vowel sign, positioned above its consonant."],
  ["ึ", "สระอึ", "sara ue", "Short ue vowel sign, positioned above its consonant."],
  ["ื", "สระอือ", "sara uee", "Long ue vowel sign, positioned above its consonant."],
  ["ุ", "สระอุ", "sara u", "Short u vowel sign, positioned below its consonant."],
  ["ู", "สระอู", "sara uu", "Long uu vowel sign, positioned below its consonant."],
  ["เ", "สระเอ", "sara e", "E vowel sign, written before the onset consonant but pronounced after it."],
  ["แ", "สระแอ", "sara ae", "Ae vowel sign, written before the onset consonant but pronounced after it."],
  ["โ", "สระโอ", "sara o", "O vowel sign, written before the onset consonant but pronounced after it."],
  ["ใ", "สระใอไม้ม้วน", "sara ai mai muan", "Ai vowel sign, written before the onset consonant."],
  ["ไ", "สระไอไม้มลาย", "sara ai mai malai", "Ai vowel sign, written before the onset consonant."],
  ["ๅ", "ลากข้าง", "laakkhang", "Vowel-length sign used in a small set of words; its value depends on the spelling."],
  ["็", "ไม้ไต่คู้", "mai taikhu", "Above-consonant mark used to show a short vowel in certain spellings."],
];

const marks = [
  ["่", "ไม้เอก", "mai ek", "Tone mark. Its effect depends on consonant class and whether the syllable is live or dead."],
  ["้", "ไม้โท", "mai tho", "Tone mark. Its effect depends on consonant class and whether the syllable is live or dead."],
  ["๊", "ไม้ตรี", "mai tri", "Tone mark. Its effect depends on consonant class and whether the syllable is live or dead."],
  ["๋", "ไม้จัตวา", "mai chattawa", "Tone mark. Its effect depends on consonant class and whether the syllable is live or dead."],
  ["์", "ทัณฑฆาต", "thanthakhat", "Silencing mark; the consonant it covers is not pronounced."],
  ["ํ", "นิคหิต", "nikhahit", "Above-consonant nasal mark, often used as part of a vowel spelling; read with its word context."],
  ["๎", "ยามักการ", "yamakkan", "Rare mark used in selected spellings; its value depends on the word."],
  ["ฺ", "พินทุ", "phinthu", "Underdot used mainly in Sanskrit-derived spellings; it does not have a reliable standalone sound here."],
  ["ๆ", "ไม้ยมก", "mai yamok", "Repetition mark; repeats the preceding word or phrase."],
];

export const THAI_CHARACTER_REFERENCE = Object.freeze(Object.fromEntries([
  ...consonants.map(([character, name, romanization, initial, final]) => [character, Object.freeze({ kind: "consonant", name, romanization, initial, final, consonantClass: Object.keys(consonantClasses).find(className => consonantClasses[className].has(character)) ?? null })]),
  ...vowels.map(([character, name, romanization, explanation]) => [character, Object.freeze({ kind: "vowel", name, romanization, explanation })]),
  ...marks.map(([character, name, romanization, explanation]) => [character, Object.freeze({ kind: "mark", name, romanization, explanation })]),
]));

const consonantSet = new Set(consonants.map(([character]) => character));
const vowelSet = new Set(vowels.map(([character]) => character));
const toneMarks = new Set(["่", "้", "๊", "๋"]);
const isCombiningMark = character => /\p{M}/u.test(character);
const belowMarkSet = new Set(["ุ", "ู", "ฺ"]);

const compoundVowelPatterns = [
  { pattern: /เ[ก-ฮ]า/g, name: "เอา", sound: "ao" },
  { pattern: /เ[ก-ฮ]ี[ย]/g, name: "เอีย", sound: "ia" },
  { pattern: /เ[ก-ฮ]ื[อ]/g, name: "เอือ", sound: "uea" },
  { pattern: /[ก-ฮ]ั[ว]/g, name: "อัว", sound: "ua" },
];

function compoundVowelAt(word, characterIndex) {
  if (Array.from(word).filter(character => consonantSet.has(character)).length !== 1) return null;
  for (const character of Array.from(word)) {
    for (const { pattern, name, sound } of compoundVowelPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(word)) !== null) {
        const start = Array.from(word.slice(0, match.index)).length;
        const end = start + Array.from(match[0]).length;
        if (characterIndex >= start && characterIndex < end && vowelSet.has(character)) return { name, sound };
      }
    }
  }
  return null;
}

function hasVowelAfterOnset(characters, index) {
  for (let cursor = index + 1; cursor < characters.length; cursor++) {
    if (consonantSet.has(characters[cursor])) return false;
    if (vowelSet.has(characters[cursor])) return true;
  }
  return false;
}

function isCoveredBySilencingMark(characters, index) {
  for (let cursor = index + 1; cursor < characters.length; cursor++) {
    if (consonantSet.has(characters[cursor])) return false;
    if (characters[cursor] === "์") return true;
  }
  return false;
}

export function describeThaiCharacter(word, characterIndex) {
  const characters = Array.from(word);
  const character = characters[characterIndex];
  const reference = THAI_CHARACTER_REFERENCE[character];
  if (!reference) return null;

  let explanation;
  if (reference.kind === "consonant") {
    const consonantIndices = characters.flatMap((item, index) => consonantSet.has(item) ? [index] : []);
    const isFirstConsonant = consonantIndices[0] === characterIndex;
    const isLastConsonant = consonantIndices.at(-1) === characterIndex;
    if (word !== "อาชีพ") {
      explanation = `Alphabet consonant ${reference.initial}; its syllable role cannot be determined reliably without a verified spelling boundary.`;
    } else if (isCoveredBySilencingMark(characters, characterIndex)) {
      explanation = `This consonant is silent under the thanthakhat mark in ${word}.`;
    } else if (character === "อ" && isFirstConsonant && hasVowelAfterOnset(characters, characterIndex)) {
      explanation = `Initial vowel carrier in ${word}; it marks the onset here rather than adding an independent “o” vowel.`;
    } else if (isLastConsonant && reference.final) {
      explanation = `Final consonant in ${word}; pronounced as an unreleased “${reference.final}” sound.`;
    } else if (hasVowelAfterOnset(characters, characterIndex)) {
      const role = isFirstConsonant ? "Initial" : "Initial of its syllable (onset)";
      explanation = `${role} “${reference.initial}” consonant sound in ${word}.`;
    } else {
      explanation = `Alphabet consonant ${reference.initial}; its syllable role cannot be determined reliably from this spelling alone.`;
    }
  } else if (reference.kind === "vowel") {
    const compound = compoundVowelAt(word, characterIndex);
    explanation = compound
      ? `Part of the compound vowel ${compound.name}; together the signs form the “${compound.sound}” vowel in ${word}.`
      : `${reference.explanation} In ${word}, this is a vowel sign, not a consonant sound.`;
  } else if (toneMarks.has(character)) {
    explanation = `${reference.explanation} The exact tone is not inferred from this mark alone.`;
  } else {
    explanation = reference.explanation;
  }

  return Object.freeze({ character, kind: reference.kind, name: reference.name, romanization: reference.romanization, explanation });
}

const shortVowelSigns = new Set(["ะ", "ั", "ิ", "ึ", "ุ", "็"]);
const longVowelSigns = new Set(["า", "ี", "ื", "ู", "เ", "แ", "โ", "ใ", "ไ"]);
const stopCodas = new Set(["p", "t", "k"]);
const nasalCodas = new Set(["m", "n", "ng"]);

function syllableSpellings(word, dictionarySyllables) {
  if (!Array.isArray(dictionarySyllables) || dictionarySyllables.length === 0) return null;
  const spellings = dictionarySyllables.map(syllable => syllable?.spelling);
  if (spellings.some(spelling => typeof spelling !== "string" || spelling.length === 0)) return null;
  if (spellings.length !== dictionarySyllables.length || spellings.join("") !== word) return null;
  return spellings;
}

function dictionaryConfirmsImplicitShortO(reading, finalSound) {
  if (typeof reading !== "string" || reading.length === 0) return null;
  const normalized = reading.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!/^\p{L}+$/u.test(normalized)) return null;
  const romanizedFinal = normalized.endsWith("ng") ? "ng" : normalized.at(-1);
  if (romanizedFinal !== finalSound) return false;
  const codaLength = romanizedFinal.length;
  const syllableBody = normalized.slice(0, -codaLength);
  const writtenRomanizedVowels = Array.from(syllableBody).filter(character => "aeiou".includes(character));
  return syllableBody.endsWith("o") && writtenRomanizedVowels.length === 1;
}

function inspectSyllableSpelling(spelling, dictionaryReading) {
  const characters = Array.from(spelling);
  const consonantIndices = characters.flatMap((character, index) => consonantSet.has(character) ? [index] : []);
  const vowelIndices = characters.flatMap((character, index) => vowelSet.has(character) ? [index] : []);
  const markIndex = characters.findIndex(character => toneMarks.has(character));
  const firstConsonantIndex = consonantIndices[0];
  const firstConsonant = characters[firstConsonantIndex];
  if (!firstConsonant) return null;
  const lastConsonantIndex = consonantIndices.at(-1);
  const hasInternalVowel = vowelIndices.some(index => index > firstConsonantIndex && index < lastConsonantIndex);
  const finalCharacter = consonantIndices.length === 2 ? characters[lastConsonantIndex] : null;
  const finalSound = finalCharacter ? THAI_CHARACTER_REFERENCE[finalCharacter]?.final : null;
  const toneMarkCount = characters.filter(character => toneMarks.has(character)).length;
  const toneMarkOnsetPosition = markIndex < 0 || markIndex > firstConsonantIndex && markIndex < lastConsonantIndex;
  const supportedCoda = stopCodas.has(finalSound) || nasalCodas.has(finalSound);
  const hasBareClosedSpelling = characters.length === 2 + toneMarkCount
    && consonantIndices.length === 2
    && vowelIndices.length === 0
    && toneMarkCount <= 1
    && toneMarkOnsetPosition
    && characters.every(character => consonantSet.has(character) || toneMarks.has(character))
    && firstConsonant !== "อ"
    && finalCharacter !== "ร"
    && supportedCoda
    && dictionaryConfirmsImplicitShortO(dictionaryReading, finalSound);
  const implicitVowel = hasBareClosedSpelling ? "o" : null;

  // Multiple adjacent consonants can be a cluster, leading consonant, silent
  // letter or coda. The unwritten-vowel case accepted here is a bare C+C
  // closed syllable whose one-syllable reading confirms a short o and its coda.
  if (consonantIndices.length > 2 || (consonantIndices.length === 2 && !hasInternalVowel && !hasBareClosedSpelling)) return null;

  const finalIndex = consonantIndices.length === 2 ? lastConsonantIndex : -1;
  const toneMark = markIndex >= 0 ? characters[markIndex] : null;
  if (characters.filter(character => toneMarks.has(character)).length > 1) return null;

  const presentVowels = characters.filter(character => vowelSet.has(character));
  const vowelLength = presentVowels.some(character => shortVowelSigns.has(character))
    ? "short"
    : presentVowels.length && presentVowels.every(character => longVowelSigns.has(character))
      ? "long"
      : implicitVowel
        ? "short"
        : null;
  const consonantClass = THAI_CHARACTER_REFERENCE[firstConsonant]?.consonantClass ?? null;
  const codaType = finalSound && stopCodas.has(finalSound)
    ? "dead stop"
    : finalSound && nasalCodas.has(finalSound) || finalSound === "w" || finalSound === "y"
      ? "live sonorant"
      : finalCharacter
        ? null
        : vowelLength === "short"
          ? "dead short open"
          : vowelLength === "long"
            ? "live open"
            : null;

  const toneNames = {
    "่": { high: "low", middle: "low", low: "falling" },
    "้": { high: "falling", middle: "falling", low: "high" },
    "๊": { middle: "high" },
    "๋": { middle: "rising" },
  };
  let ruleTone = toneMark ? toneNames[toneMark]?.[consonantClass] : null;
  let rule;
  if (toneMark && ruleTone) {
    const markName = THAI_CHARACTER_REFERENCE[toneMark].name;
    rule = `${consonantClass}-class initial + ${markName} determines ${ruleTone} tone`;
  } else if (!toneMark && consonantClass === "middle" && codaType) {
    ruleTone = codaType.startsWith("live") ? "mid" : "low";
    rule = `Middle-class initial + ${codaType} syllable without a tone mark gives ${ruleTone} tone`;
  } else if (!toneMark && consonantClass === "high" && codaType) {
    ruleTone = codaType.startsWith("live") ? "rising" : "low";
    rule = `High-class initial + ${codaType} syllable without a tone mark gives ${ruleTone} tone`;
  } else if (!toneMark && consonantClass === "low" && codaType) {
    if (codaType.startsWith("live")) {
      ruleTone = "mid";
      rule = `Low-class initial + live syllable without a tone mark gives mid tone`;
    } else if (codaType === "dead stop" && vowelLength === "long") {
      ruleTone = "falling";
      rule = `Low-class initial + long vowel + final stop makes a dead long syllable; without a tone mark it has falling tone`;
    } else if (codaType === "dead short open" || codaType === "dead stop" && vowelLength === "short") {
      ruleTone = "high";
      rule = `Low-class initial + short dead syllable without a tone mark gives high tone`;
    }
  }

  return Object.freeze({ characters, consonantIndices, vowelIndices, firstConsonantIndex, firstConsonant, lastConsonantIndex, finalIndex, finalCharacter, finalSound, toneMark, vowelLength, implicitVowel, consonantClass, codaType, ruleTone, rule });
}

function describeSyllableCharacter(spelling, characterIndex, analysis) {
  const base = describeThaiCharacter(spelling, characterIndex);
  if (!base || !analysis) return base;
  const reference = THAI_CHARACTER_REFERENCE[base.character];
  let functionText = reference.explanation ?? "Part of this Thai syllable spelling.";

  if (base.kind === "consonant") {
    if (isCoveredBySilencingMark(analysis.characters, characterIndex)) {
      functionText = "Silent consonant under the thanthakhat mark.";
    } else if (characterIndex === analysis.firstConsonantIndex) {
      functionText = base.character === "อ" && analysis.vowelIndices.length
        ? `${reference.consonantClass}-class vowel carrier; no independent “o” sound here.`
        : `${reference.consonantClass}-class initial “${reference.initial}” sound.`;
    } else if (characterIndex === analysis.finalIndex) {
      if (stopCodas.has(analysis.finalSound)) functionText = `Final ${analysis.finalSound} stop; unreleased at the end of this syllable.`;
      else if (nasalCodas.has(analysis.finalSound)) functionText = `Final nasal “${analysis.finalSound}”; this is a live syllable ending.`;
      else if (analysis.finalSound === "w" || analysis.finalSound === "y") functionText = `Final “${analysis.finalSound}” glide; this is a live syllable ending.`;
    } else {
      functionText = `Consonant in the onset cluster; the first consonant controls the tone class.`;
    }
  } else if (base.kind === "vowel") {
    const length = analysis.vowelLength === "long" ? "Long" : analysis.vowelLength === "short" ? "Short" : "Vowel length depends on the complete spelling.";
    const position = belowMarkSet.has(base.character) ? "below" : isCombiningMark(base.character) ? "above" : "in the written vowel sequence";
    functionText = `${length} vowel sign, ${position}; it contributes to the syllable vowel, not a separate consonant.`;
  } else if (toneMarks.has(base.character)) {
    functionText = analysis.ruleTone
      ? `${reference.name}; with a ${analysis.consonantClass}-class initial, this contributes to ${analysis.ruleTone} tone.`
      : `${reference.name}; its tone effect depends on spelling details not resolved here.`;
  }
  return Object.freeze({ ...base, explanation: functionText });
}

export function describeThaiSyllable(word, characterIndex, dictionarySyllables = []) {
  const pieces = syllableSpellings(word, dictionarySyllables);
  if (!pieces || !Number.isInteger(characterIndex) || characterIndex < 0) return null;
  let start = 0;
  for (let syllableIndex = 0; syllableIndex < pieces.length; syllableIndex++) {
    const spelling = pieces[syllableIndex];
    const end = start + Array.from(spelling).length;
    if (characterIndex >= start && characterIndex < end) {
      const dictionary = dictionarySyllables[syllableIndex];
      const analysis = inspectSyllableSpelling(spelling, dictionary?.reading);
      // Keep the existing character description if this syllable uses an
      // unsupported cluster or spelling; never fabricate a boundary or sound.
      if (!analysis || !dictionary?.reading || !dictionary?.tone) return null;
      const breakdown = analysis.characters.map((character, localIndex) => describeSyllableCharacter(spelling, localIndex, analysis));
      const providedTone = String(dictionary.tone).toLowerCase();
      const verifiedTone = ["mid", "low", "falling", "high", "rising"].includes(providedTone) ? providedTone : null;
      const onsetText = analysis.firstConsonant === "อ"
        ? "vowel carrier"
        : `${THAI_CHARACTER_REFERENCE[analysis.firstConsonant]?.initial ?? "consonant"} onset`;
      const vowelText = analysis.implicitVowel
        ? `unwritten short /${analysis.implicitVowel}/ vowel`
        : analysis.vowelIndices.map(index => THAI_CHARACTER_REFERENCE[analysis.characters[index]]?.romanization).filter(Boolean).join(" + ") || "vowel pattern";
      const finalText = analysis.finalCharacter ? ` + final /${analysis.finalSound}/` : " + open ending";
      const combined = `${onsetText} + ${vowelText}${finalText}`;
      const toneFactors = `${analysis.consonantClass ?? "unknown-class"}-class initial, ${analysis.vowelLength ?? "unknown-length"} vowel, ${analysis.codaType ?? "unresolved"} ending, ${analysis.toneMark ? `written ${THAI_CHARACTER_REFERENCE[analysis.toneMark]?.name}` : "no written tone mark"}`;
      const toneRule = analysis.ruleTone && verifiedTone && analysis.ruleTone === verifiedTone
        ? `Tone rule: ${toneFactors} → ${analysis.ruleTone} tone. This matches the bundled dictionary reading.`
        : analysis.ruleTone && verifiedTone
          ? `Tone rule estimate: ${toneFactors} → ${analysis.ruleTone}, but the bundled reading says ${verifiedTone}; context is not resolved, so the rule is not asserted.`
          : `The bundled dictionary reading identifies ${verifiedTone ?? dictionary.tone} tone. Tone factors: ${toneFactors}; the spelling rule is not determined reliably here.`;
      return Object.freeze({
        spelling,
        reading: dictionary.reading,
        tone: verifiedTone ?? dictionary.tone,
        index: syllableIndex + 1,
        count: pieces.length,
        breakdown,
        combined,
        toneRule,
        consonantClass: analysis.consonantClass,
        vowelLength: analysis.vowelLength,
        implicitVowel: analysis.implicitVowel,
        initial: analysis.firstConsonant ? `${THAI_CHARACTER_REFERENCE[analysis.firstConsonant].initial}` : null,
        final: analysis.finalCharacter ? { character: analysis.finalCharacter, sound: analysis.finalSound, type: analysis.codaType } : null,
        writtenToneMark: analysis.toneMark,
      });
    }
    start = end;
  }
  return null;
}

export function createThaiCharacterHitAreas(word, label, overlay, onEnter, onLeave, dictionarySyllables = []) {
  const textNode = label.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [];
  const characters = Array.from(word);
  const labelRect = label.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) context.font = getComputedStyle(label).font;
  const offsets = [];
  let textOffset = 0;
  for (const character of characters) {
    offsets.push(textOffset);
    textOffset += character.length;
  }
  const measureRange = (startIndex, endIndex) => {
    const range = document.createRange();
    range.setStart(textNode, offsets[startIndex]);
    range.setEnd(textNode, offsets[endIndex] ?? textNode.length);
    return range.getBoundingClientRect();
  };
  const measureText = value => context?.measureText(value);
  const targets = [];
  characters.forEach((character, characterIndex) => {
    if (!THAI_CHARACTER_REFERENCE[character]) return;

    let rect = measureRange(characterIndex, characterIndex + 1);
    if (isCombiningMark(character) && context) {
      let baseIndex = characterIndex - 1;
      while (baseIndex >= 0 && !consonantSet.has(characters[baseIndex]) && !/\s/u.test(characters[baseIndex])) baseIndex--;
      if (baseIndex >= 0 && consonantSet.has(characters[baseIndex])) {
        const baseCharacter = characters[baseIndex];
        const previousText = characters.slice(baseIndex, characterIndex).join("");
        const currentText = characters.slice(baseIndex, characterIndex + 1).join("");
        const previousMetrics = measureText(previousText);
        const currentMetrics = measureText(currentText);
        const baseMetrics = measureText(baseCharacter);
        if (previousMetrics && currentMetrics && baseMetrics) {
          rect = measureRange(baseIndex, characterIndex + 1);
          const baseline = rect.top + (currentMetrics.fontBoundingBoxAscent || currentMetrics.actualBoundingBoxAscent);
          const baseTop = baseline - baseMetrics.actualBoundingBoxAscent;
          const baseBottom = baseline + baseMetrics.actualBoundingBoxDescent;
          let top;
          let bottom;
          if (belowMarkSet.has(character) && currentMetrics.actualBoundingBoxDescent > previousMetrics.actualBoundingBoxDescent) {
            top = baseline + previousMetrics.actualBoundingBoxDescent;
            bottom = baseline + currentMetrics.actualBoundingBoxDescent;
          } else if (currentMetrics.actualBoundingBoxAscent > previousMetrics.actualBoundingBoxAscent) {
            top = baseline - currentMetrics.actualBoundingBoxAscent;
            bottom = baseline - previousMetrics.actualBoundingBoxAscent;
          } else if (belowMarkSet.has(character)) {
            top = baseBottom;
            bottom = baseBottom + Math.max(3, parseFloat(getComputedStyle(label).fontSize) * 0.2);
          } else {
            top = baseTop - Math.max(3, parseFloat(getComputedStyle(label).fontSize) * 0.2);
            bottom = baseTop;
          }
          const fontSize = parseFloat(getComputedStyle(label).fontSize) || 16;
          const targetWidth = Math.min(rect.width, Math.max(fontSize * 0.34, rect.width * 0.55));
          rect = new DOMRect(rect.left + (rect.width - targetWidth) / 2, top, targetWidth, Math.max(3, bottom - top));
        }
      }
    } else if (consonantSet.has(character) && context && characters[characterIndex + 1] && isCombiningMark(characters[characterIndex + 1])) {
      const followingMark = characterIndex + 1;
      const baseText = characters.slice(characterIndex, followingMark).join("");
      const baseMetrics = measureText(baseText);
      const combinedMetrics = measureText(characters.slice(characterIndex, followingMark + 1).join(""));
      if (baseMetrics && combinedMetrics) {
        const combinedRect = measureRange(characterIndex, followingMark + 1);
        const baseline = combinedRect.top + (combinedMetrics.fontBoundingBoxAscent || combinedMetrics.actualBoundingBoxAscent);
        const top = baseline - baseMetrics.actualBoundingBoxAscent;
        const bottom = baseline + baseMetrics.actualBoundingBoxDescent;
        if (bottom > top) rect = new DOMRect(combinedRect.left, top, combinedRect.width, bottom - top);
      }
    }
    if (!rect.width || !rect.height) return;

    const target = document.createElement("button");
    target.type = "button";
    target.className = "thai-character-hit-area";
    target.dataset.characterIndex = String(characterIndex);
    target.dataset.thaiCharacter = character;
    target.setAttribute("aria-label", `${character}, ${THAI_CHARACTER_REFERENCE[character].name}, ${THAI_CHARACTER_REFERENCE[character].romanization}`);
    target.style.left = `${rect.left - labelRect.left}px`;
    target.style.top = `${rect.top - labelRect.top}px`;
    target.style.width = `${rect.width}px`;
    target.style.height = `${rect.height}px`;
    target.addEventListener("mouseenter", () => {
      const characterInfo = describeThaiCharacter(word, characterIndex);
      const syllableInfo = describeThaiSyllable(word, characterIndex, dictionarySyllables);
      onEnter(target, syllableInfo ? Object.freeze({ ...characterInfo, syllableInfo }) : characterInfo);
    });
    target.addEventListener("mouseleave", onLeave);
    target.addEventListener("focus", () => {
      const characterInfo = describeThaiCharacter(word, characterIndex);
      const syllableInfo = describeThaiSyllable(word, characterIndex, dictionarySyllables);
      onEnter(target, syllableInfo ? Object.freeze({ ...characterInfo, syllableInfo }) : characterInfo);
    });
    target.addEventListener("blur", onLeave);
    overlay.append(target);
    targets.push(target);
  });
  return targets;
}
