import React from "react";
import cards800 from "@/assets/preorder/ww-cards-800.webp";
import cards1600 from "@/assets/preorder/ww-cards-1600.webp";
import cardsPng from "@/assets/preorder/ww-cards-1200.png";

/**
 * Photo of the physical deck (three faces, the Match Die, a card back).
 * Transparent background, so it sits on cream or night. WebP at two widths,
 * with a compressed PNG for browsers without WebP. Intrinsic size is set so
 * the layout never jumps while it loads. A soft table shadow (.ww-cards-photo
 * in index.css) follows the cards' outline so they sit on the page.
 */
const PreorderCardsPhoto: React.FC<{
  maxWidth?: number;
  priority?: boolean;
  sizes?: string;
  style?: React.CSSProperties;
}> = ({ maxWidth = 560, priority = false, sizes = "(max-width: 640px) 92vw, 560px", style }) => {
  // Fade the photo in once decoded (its space is already reserved), so it
  // never pops in after the rest of the page. Cached images show at once.
  const [shown, setShown] = React.useState(false);
  const imgRef = React.useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setShown(true);
  }, []);
  return (
  <picture style={{ display: "block", width: "100%", maxWidth, margin: "0 auto", ...style }}>
    <source type="image/webp" srcSet={`${cards800} 800w, ${cards1600} 1600w`} sizes={sizes} />
    <img
      src={cardsPng}
      alt="Whoop! Whoop! cards: a red 1 square, an orange 2 triangles, a blue 3 stars, the Match Die and a card back"
      width={2024}
      height={901}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchpriority: "high" } : {})}
      ref={imgRef}
      onLoad={() => setShown(true)}
      onError={() => setShown(true)}
      className="ww-cards-photo"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(6px)",
        transition: "opacity 320ms ease-out, transform 320ms ease-out",
      }}
    />
  </picture>
  );
};

export default PreorderCardsPhoto;
