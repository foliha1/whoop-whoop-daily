import ClassicResultScreen from "@/components/ClassicResultScreen";
const names = ["FELIX", "MAYA", "JO", "SAM", "KIT", "ROBBY"];
export default function ResultPreview() {
  return (
    <ClassicResultScreen
      entries={names.map((n, i) => ({ seat: i, name: n, score: 10 - i }))}
      target={10}
      canRematch
      onPlayAgain={() => {}}
      onInvite={() => {}}
      onDone={() => {}}
      mobile
    />
  );
}
