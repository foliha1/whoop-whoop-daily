export interface FaqItem {
  q: string;
  a: string;
  list?: string[];
}

export declare const FAQ_ITEMS: FaqItem[];
export declare const FAQ_JSON_LD: {
  "@context": string;
  "@type": string;
  mainEntity: {
    "@type": string;
    name: string;
    acceptedAnswer: {
      "@type": string;
      text: string;
    };
  }[];
};
