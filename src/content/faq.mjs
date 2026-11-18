/** One source for the visible FAQ, structured data, and static build content. */
export const FAQ_ITEMS = [
  {
    q: "What is Whoop! Whoop!?",
    a: "Whoop! Whoop! is a free, web-based memory card game created by Felix Oliha and published by Oleeha & Co. Unlike traditional memory games where matches are static, Whoop! Whoop! rolls a die to change what counts as a match, so players find pairs by matching colors, numbers, or shapes under shifting rules.",
  },
  {
    q: "How does the Daily puzzle work?",
    a: "A new Daily puzzle unlocks every day at midnight in your local timezone.",
    list: [
      "The Board: 9 cards dealt face-down on a 3×3 grid.",
      "The Study Phase: You get 10 seconds to view all 9 cards and memorize their positions.",
      "The Rounds: The game plays across 3 rounds. Before each round, the die rolls to set the matching rule (Color, Number, or Shape).",
      "Misses: You are allowed up to 2 misses per round. Finish all 3 rounds to complete the puzzle, protect your streak, and see your daily stats.",
    ],
  },
  {
    q: "Is Whoop! Whoop! connected to the WHOOP fitness tracker or wearable?",
    a: "No. Whoop! Whoop! is an independent memory card game created by Felix Oliha and Oleeha & Co. It has no affiliation, sponsorship, or connection with WHOOP, Inc. or the WHOOP fitness wearable.",
  },
  {
    q: "Do I need to download an app or create an account to play?",
    a: "No. The game runs directly in your web browser on phones, tablets, and computers at whoop-whoop.com. There is no download, installation, subscription, or payment required. Creating an account is optional and only used to sync your streak and statistics across devices.",
  },
  {
    q: "Can I play Whoop! Whoop! with friends or solo?",
    a: "Yes. In addition to the Daily challenge, Whoop! Whoop! includes a Solo mode where you play against the built-in computer opponent FELIX, and a Together mode where you start a private table and share an invite code with friends to play in real time.",
  },
];

export const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: [item.a, ...(item.list ?? [])].join(" "),
    },
  })),
};
