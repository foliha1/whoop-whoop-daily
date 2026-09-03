import ClassicResultScreen from "@/components/ClassicResultScreen";

const entries = [
  { seat: 0, name: "You", score: 10 },
  { seat: 1, name: "WHOOP", score: 8 },
  { seat: 2, name: "Alex", score: 6 },
  { seat: 3, name: "B", score: 6 },
  { seat: 4, name: "Casey", score: 3 },
  { seat: 5, name: "Drew", score: 1 },
];

const ChasePreview = () => (
  <ClassicResultScreen
    entries={entries}
    target={10}
    canRematch
    onPlayAgain={() => {}}
    onInvite={() => {}}
    onDone={() => {}}
    mobile={false}
  />
);

export default ChasePreview;
