// Server stand-in for src/lib/assetUrls.ts. The real file imports build-hashed
// art the server has no use for. Cards on the server carry an empty svgPath;
// phones look art up from the card id (ALL_CARDS in src/cardData.ts).
export const CARD_BACK_URL = "";
export function cardArt(_name: string): string {
  return "";
}
