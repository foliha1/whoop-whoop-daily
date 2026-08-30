import { useEffect, useRef, useState } from "react";
import { Card, CARD_BACK_PATH } from "@/cardData";
import { COLORS, RADIUS } from "@/lib/tokens";
import { CARD_FLIP_MS } from "@/lib/animationTiming";


interface GameCardProps {
  card: Card;
  faceUp: boolean;
  onClick?: () => void;
  highlighted?: boolean;
  matched?: boolean;
  wrong?: boolean;
  shrinking?: boolean;
  entering?: boolean;
  enterDelay?: number;
  shaking?: boolean;
  fill?: boolean;
  /** When false the card is presentational only: no cursor, no press/hover
   *  feedback, no keyboard/click handling. Used while another seat holds an
   *  open claim so taps read as "not my turn" rather than "game frozen". */
  interactive?: boolean;
  /** Remount key for the deal-in wrapper; changing it replays the animation. */
  dealKey?: string | number;
  /** Stagger index for the deal-in animation (`--ww-deal-i`). */
  dealIndex?: number;
  /** Receives the selection wash element so callers can await its animationend. */
  washRef?: (el: HTMLDivElement | null) => void;
  /** Corner radius in px. Defaults to the board's value; How to Play passes a
   *  width-proportional radius (see `cardRadius`) because its cards are drawn
   *  at several fixed sizes rather than one fluid board size. */
  radius?: number;
}




const GameCard = ({
  card,
  faceUp,
  onClick,
  highlighted,
  matched,
  wrong,
  shrinking,
  entering,
  enterDelay = 0,
  shaking,
  fill,
  interactive = true,
  dealKey,
  dealIndex,
  washRef,
  radius = RADIUS.md,
}: GameCardProps) => {


  const [focusVis, setFocusVis] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCardW(w);
    });
    ro.observe(el);
    setCardW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const k = cardW > 0 ? cardW / 104.333 : 0;

  // Sticky front face: when the face is taken away (card cleared / returned to
  // the pile) the flip-down is still mid-rotation, so swapping the front <img>
  // to the card back immediately shows the back through the front face. Keep
  // the last known face mounted for the length of the flip instead.
  const lastFaceRef = useRef<string | null>(card.svgPath || null);
  if (card.svgPath) lastFaceRef.current = card.svgPath;
  const [stickyFace, setStickyFace] = useState<string | null>(lastFaceRef.current);
  useEffect(() => {
    if (card.svgPath) {
      setStickyFace(card.svgPath);
      return;
    }
    const t = setTimeout(() => setStickyFace(null), CARD_FLIP_MS);
    return () => clearTimeout(t);
  }, [card.svgPath]);
  const frontFace = card.svgPath || stickyFace;

  const boxShadow = undefined;


  let outerTransform = "";
  let outerTransition = "transform 0.4s ease, opacity 0.4s ease";
  let outerOpacity = 1;

  if (shrinking) {
    outerTransform = "scale(0.5)";
    outerOpacity = 0;
  }

  const animStyle = wrong || matched
    ? undefined
    : entering
    ? `card-enter-${card.id} 0.3s ease ${enterDelay}ms both`
    : "none";

  const shapeLabel = card.shape === "tri" ? "triangle" : card.shape;
  const ariaLabel = faceUp
    ? `${card.color} ${shapeLabel}, ${card.number}`
    : `Card ${card.id}, face down`;

  // NOTE: matched intentionally gets NO `ww-great` here. The scale/slide is
  // performed by a flying copy rendered in a fixed-position layer above the
  // grid; the real card only keeps its green wash + ring in place.
  // Selection is a one-shot hold animation; removing the class ends it
  // immediately with no exit transition.
  const wrapperClass = wrong ? "ww-wrong" : undefined;



  return (
    <div
      ref={wrapperRef}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={ariaLabel}
      aria-disabled={interactive ? undefined : true}
      className={wrapperClass}

      style={{
        perspective: 600,
        width: "100%",
        height: fill ? "100%" : undefined,
        aspectRatio: fill ? undefined : "5/7",
        cursor: interactive ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
        borderRadius: radius,
        boxShadow,
        transformOrigin: "center",
        ["--ww-k" as string]: String(k),
        transform: shrinking ? outerTransform : undefined,
        opacity: shrinking ? outerOpacity : undefined,
        transition: shrinking ? outerTransition : undefined,
        animation: animStyle,
        outline: focusVis ? `2px solid ${COLORS.blue}` : "none",
        outlineOffset: 2,
        WebkitTapHighlightColor: interactive ? undefined : "transparent",
      }}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}

      onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setFocusVis(true); }}
      onBlur={() => setFocusVis(false)}
    >
      {/* Inner wrapper: carries the deal-in animation so the outer tappable
          element (position + hit area) never moves mid-deal. */}
      <div
        key={dealKey}
        className={dealIndex !== undefined ? "ww-deal" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          ...(dealIndex !== undefined
            ? { ["--ww-deal-i" as string]: String(dealIndex) }
            : {}),
        }}
      >
      <div

        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: `transform ${CARD_FLIP_MS}ms cubic-bezier(0.4,0,0.2,1)`,
          transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >

        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            borderRadius: radius,
            overflow: "hidden",
            boxShadow,
          }}
        >
          {/* Always mounted: unmounting inside a preserve-3d subtree rebuilds
              the compositor layer and hitches the flip. When no card is known
              we keep a cached image loaded but fully transparent. Opacity
              switches at the 250ms midpoint of the 500ms rotateY so the face
              is visible only while pointing at the viewer, not while edge-on. */}
          <img
            src={card.svgPath || CARD_BACK_PATH}
            alt={card.svgPath ? card.id : ""}
            aria-hidden={card.svgPath ? undefined : true}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              opacity: card.svgPath ? 1 : 0,
              transition: "opacity 0s linear 250ms",
            }}
            draggable={false}
          />
        </div>


        {/* Back */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            borderRadius: radius,
            overflow: "hidden",
            boxShadow,
            transform: "rotateY(180deg)",
          }}
        >
          <img
            src={CARD_BACK_PATH}
            alt="card back"
            style={{ width: "100%", height: "100%", display: "block" }}
            draggable={false}
          />
        </div>
      </div>

      {highlighted && !wrong && !matched && (
        <>
          <div ref={washRef} className="ww-select-wash" style={{ zIndex: 2 }} />
          <div className="ww-select-ring" style={{ zIndex: 3 }} />
        </>
      )}

      {wrong && (
        <>
          <div className="ww-wrong-wash" style={{ zIndex: 4 }} />
          <div className="ww-wrong-ring" style={{ zIndex: 5 }} />
        </>
      )}

      {matched && !wrong && (
        <>
          <div
            className="ww-great-wash"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}
          />
          <div className="ww-great-shine" style={{ pointerEvents: "none", zIndex: 5 }} />
          <div
            className="ww-great-ring"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}
          />
        </>
      )}
      </div>



    </div>
  );
};

export default GameCard;
