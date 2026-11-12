import test from "node:test";
import assert from "node:assert/strict";
import { describeThaiCharacter, THAI_CHARACTER_REFERENCE } from "../src/thai-character-inspector.mjs";

test("the offline reference covers Thai consonants, common vowels, and tone marks", () => {
  assert.equal(Object.values(THAI_CHARACTER_REFERENCE).filter(entry => entry.kind === "consonant").length, 44);
  assert.equal(THAI_CHARACTER_REFERENCE["ช"].name, "ช ช้าง");
  assert.equal(THAI_CHARACTER_REFERENCE["ช"].romanization, "cho chang");
  assert.equal(THAI_CHARACTER_REFERENCE["ี"].name, "สระอี");
  assert.equal(THAI_CHARACTER_REFERENCE["ุ"].kind, "vowel");
  assert.equal(THAI_CHARACTER_REFERENCE["่"].kind, "mark");
});

test("อาชีพ distinguishes the vowel carrier, vowel signs, onset, and final p", () => {
  const word = "อาชีพ";
  assert.match(describeThaiCharacter(word, 0).explanation, /Initial vowel carrier/);
  assert.match(describeThaiCharacter(word, 1).explanation, /Long aa vowel sign/);
  assert.match(describeThaiCharacter(word, 2).explanation, /Initial.*“ch” consonant sound/);
  assert.equal(describeThaiCharacter(word, 3).character, "ี");
  assert.match(describeThaiCharacter(word, 3).explanation, /Long ee vowel sign, positioned above/);
  assert.match(describeThaiCharacter(word, 4).explanation, /Final consonant.*unreleased “p”/);
});

test("above vowels, below vowels, and tone marks are identified without guessing tone", () => {
  assert.match(describeThaiCharacter("กุ", 1).explanation, /positioned below/);
  assert.match(describeThaiCharacter("กี่", 2).name, /ไม้เอก/);
  assert.match(describeThaiCharacter("กี่", 2).explanation, /exact tone is not inferred/);
  assert.match(describeThaiCharacter("กี่", 1).explanation, /positioned above/);
});

test("known compound vowels are explained as a combination, not as isolated signs", () => {
  assert.match(describeThaiCharacter("เกา", 0).explanation, /compound vowel เอา.*“ao”/);
  assert.match(describeThaiCharacter("เกา", 2).explanation, /compound vowel เอา.*“ao”/);
  assert.equal(describeThaiCharacter("hello", 0), null);
});

test("uncertain consonant roles are described without inventing a contextual sound", () => {
  assert.match(describeThaiCharacter("หร", 0).explanation, /cannot be determined reliably/);
});
