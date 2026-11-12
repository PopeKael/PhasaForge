import test from "node:test";
import assert from "node:assert/strict";
import { describeThaiCharacter, describeThaiSyllable, THAI_CHARACTER_REFERENCE } from "../src/thai-character-inspector.mjs";

const syllable = (reading, tone) => ({ reading, tone });

test("offline reference covers 44 consonants, their three classes, vowels, and tone marks", () => {
  const entries = Object.values(THAI_CHARACTER_REFERENCE).filter(entry => entry.kind === "consonant");
  assert.equal(entries.length, 44);
  assert.equal(entries.filter(entry => entry.consonantClass === "high").length, 11);
  assert.equal(entries.filter(entry => entry.consonantClass === "middle").length, 9);
  assert.equal(entries.filter(entry => entry.consonantClass === "low").length, 24);
  assert.equal(THAI_CHARACTER_REFERENCE["ช"].name, "ช ช้าง");
  assert.equal(THAI_CHARACTER_REFERENCE["ช"].romanization, "cho chang");
  assert.equal(THAI_CHARACTER_REFERENCE["ี"].name, "สระอี");
  assert.equal(THAI_CHARACTER_REFERENCE["ุ"].kind, "vowel");
  assert.equal(THAI_CHARACTER_REFERENCE["่"].kind, "mark");
});

test("อาชีพ uses bundled syllable readings and explains ชีพ's falling tone without a mark", () => {
  const readings = [syllable("aa", "mid"), syllable("chîip", "falling")];
  const first = describeThaiSyllable("อาชีพ", 0, readings);
  assert.equal(first.spelling, "อา");
  assert.equal(first.reading, "aa");
  assert.equal(first.tone, "mid");
  assert.match(first.breakdown[0].explanation, /middle-class vowel carrier/);
  assert.match(first.breakdown[1].explanation, /Long vowel/);

  const career = describeThaiSyllable("อาชีพ", 3, readings);
  assert.equal(career.spelling, "ชีพ");
  assert.equal(career.reading, "chîip");
  assert.equal(career.tone, "falling");
  assert.match(career.breakdown[0].explanation, /low-class initial “ch”/);
  assert.match(career.breakdown[1].explanation, /Long vowel/);
  assert.match(career.breakdown[2].explanation, /unreleased at the end/);
  assert.match(career.toneRule, /long vowel, dead stop ending, no written tone mark → falling tone/);
  assert.match(career.toneRule, /matches the bundled dictionary reading/);
});

test("ที่นี่ assigns น to onset นี่, not to the preceding syllable's coda", () => {
  const readings = [syllable("tîi", "falling"), syllable("nîi", "falling")];
  const second = describeThaiSyllable("ที่นี่", 3, readings);
  assert.equal(second.spelling, "นี่");
  assert.equal(second.reading, "nîi");
  assert.equal(second.final, null);
  assert.match(second.breakdown[0].explanation, /low-class initial “n”/);
  assert.doesNotMatch(second.breakdown[0].explanation, /Final/);
  assert.equal(describeThaiSyllable("ที่นี่", 0, readings).spelling, "ที่");
});

test("บ้าน distinguishes its live nasal ending from an unreleased stop", () => {
  const home = describeThaiSyllable("บ้าน", 3, [syllable("bâan", "falling")]);
  assert.equal(home.spelling, "บ้าน");
  assert.equal(home.consonantClass, "middle");
  assert.equal(home.vowelLength, "long");
  assert.equal(home.final.sound, "n");
  assert.match(home.breakdown[3].explanation, /Final nasal “n”/);
  assert.match(home.toneRule, /live sonorant ending, written ไม้โท → falling tone/);
});

test("กิน uses its nasal coda and unmarked middle-class mid tone", () => {
  const food = describeThaiSyllable("กิน", 2, [syllable("gin", "mid")]);
  assert.equal(food.spelling, "กิน");
  assert.equal(food.final.sound, "n");
  assert.equal(food.vowelLength, "short");
  assert.equal(food.tone, "mid");
  assert.match(food.toneRule, /middle-class initial, short vowel, live sonorant ending, no written tone mark → mid tone/);
});

test("ชี้ที่นี่ maps all three dictionary syllables and tone marks", () => {
  const readings = [syllable("chíi", "high"), syllable("tîi", "falling"), syllable("nîi", "falling")];
  const examples = [
    [0, "ชี้", "high", /low-class initial “ch”/],
    [2, "ชี้", "high", /with a low-class initial.*high tone/],
    [3, "ที่", "falling", /low-class initial “th”/],
    [6, "นี่", "falling", /low-class initial “n”/],
  ];
  for (const [index, spelling, tone, breakdownPattern] of examples) {
    const result = describeThaiSyllable("ชี้ที่นี่", index, readings);
    assert.equal(result.spelling, spelling);
    assert.equal(result.tone, tone);
    const part = result.breakdown.find(character => breakdownPattern.test(character.explanation));
    assert.ok(part, `expected ${spelling} breakdown matching ${breakdownPattern}`);
  }
});

test("compound vowels, visible mark lookup, and conservative fallback remain available", () => {
  assert.match(describeThaiCharacter("กุ", 1).explanation, /positioned below/);
  assert.match(describeThaiCharacter("กี่", 2).name, /ไม้เอก/);
  assert.match(describeThaiCharacter("เกา", 0).explanation, /compound vowel เอา.*“ao”/);
  assert.match(describeThaiCharacter("เกา", 2).explanation, /compound vowel เอา.*“ao”/);
  assert.equal(describeThaiCharacter("ที่นี่", 3).explanation.includes("Final"), false);
  assert.equal(describeThaiSyllable("หร", 0, [syllable("rǒ", "rising")]), null);
  assert.equal(describeThaiSyllable("ที่นี่", 0, [syllable("tîi", "falling")]), null);
  assert.equal(describeThaiCharacter("hello", 0), null);
});
