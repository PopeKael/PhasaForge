export type ThaiCharacterInfo = Readonly<{
  character: string;
  kind: "consonant" | "vowel" | "mark";
  name: string;
  romanization: string;
  explanation: string;
  syllableInfo?: ThaiSyllableInfo;
}>;

export type ThaiSyllableCharacter = Readonly<{
  character: string;
  kind: "consonant" | "vowel" | "mark";
  name: string;
  romanization: string;
  explanation: string;
}>;

export type ThaiSyllableInfo = Readonly<{
  spelling: string;
  reading: string;
  tone: string;
  index: number;
  count: number;
  breakdown: readonly ThaiSyllableCharacter[];
  combined: string;
  toneRule: string;
  consonantClass: string | null;
  vowelLength: string | null;
  initial: string | null;
  final: Readonly<{ character: string; sound: string; type: string | null }> | null;
  writtenToneMark: string | null;
}>;

export const THAI_CHARACTER_REFERENCE: Readonly<Record<string, Readonly<Record<string, string>>>>;
export function describeThaiCharacter(word: string, characterIndex: number): ThaiCharacterInfo | null;
export function describeThaiSyllable(word: string, characterIndex: number, dictionarySyllables?: readonly Readonly<{ reading: string; tone: string }>[]): ThaiSyllableInfo | null;
export function createThaiCharacterHitAreas(
  word: string,
  label: HTMLElement,
  overlay: HTMLElement,
  onEnter: (target: HTMLButtonElement, info: ThaiCharacterInfo | null) => void,
  onLeave: () => void,
  dictionarySyllables?: readonly Readonly<{ reading: string; tone: string }>[],
): HTMLButtonElement[];
