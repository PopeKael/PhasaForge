export type ThaiCharacterInfo = Readonly<{
  character: string;
  kind: "consonant" | "vowel" | "mark";
  name: string;
  romanization: string;
  explanation: string;
}>;

export const THAI_CHARACTER_REFERENCE: Readonly<Record<string, Readonly<Record<string, string>>>>;
export function describeThaiCharacter(word: string, characterIndex: number): ThaiCharacterInfo | null;
export function createThaiCharacterHitAreas(
  word: string,
  label: HTMLElement,
  overlay: HTMLElement,
  onEnter: (target: HTMLButtonElement, info: ThaiCharacterInfo | null) => void,
  onLeave: () => void,
): HTMLButtonElement[];
