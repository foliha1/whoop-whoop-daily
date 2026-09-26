import { CARD_BACK_URL, cardArt } from "@/lib/assetUrls";
export type Shape = "circle" | "square" | "tri" | "star";
export type Number = 1 | 2 | 3 | 4;
export type ColorName = "red" | "blue" | "yellow";

export interface Card {
  id: string;
  shape: Shape;
  number: Number;
  color: ColorName;
  svgPath: string;
}

export const SHAPES: Shape[] = ["circle", "square", "tri", "star"];
export const NUMBERS: Number[] = [1, 2, 3, 4];
export const COLOR_NAMES: ColorName[] = ["red", "blue", "yellow"];
export const ATTRIBUTES = ["SHAPE", "NUMBER", "COLOR"] as const;

export const COLORS: Record<ColorName, string> = {
  red: "#d72229",
  blue: "#0072b2",
  yellow: "#e79024",
};

export const CARD_BACK_PATH = CARD_BACK_URL;

function generateAllCards(): Card[] {
  const cards: Card[] = [];
  for (const shape of SHAPES) {
    for (const number of NUMBERS) {
      for (const color of COLOR_NAMES) {
        const id = `${shape}-${number}-${color}`;
        const svgPath = cardArt(`${number}-${shape}-${color}`);
        cards.push({ id, shape, number, color, svgPath });
      }
    }
  }
  return cards;
}

const ALL_CARDS = generateAllCards();

export function createDeck(rng: () => number = Math.random): Card[] {
  const deck = [...ALL_CARDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export { ALL_CARDS };
