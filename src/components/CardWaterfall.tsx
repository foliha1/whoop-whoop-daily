// About-page Easter egg: a Solitaire-style victory cascade of the full 48-card deck.
// Cards launch one at a time, fall, bounce along the floor and leave trails on a canvas.
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ALL_CARDS } from "@/cardData";

export const CASCADE_ORDER = ALL_CARDS.map((c) => c.svgPath);

export default function CardWaterfall({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cw = Math.max(56, Math.min(96, W / 6)), ch = cw * 1.4;
    const imgs = CASCADE_ORDER.map((src) => { const i = new Image(); i.src = src; return i; });
    let idx = 0, raf = 0, card: { x: number; y: number; vx: number; vy: number; img: HTMLImageElement } | null = null;
    const launch = () => {
      if (idx >= imgs.length) return null;
      const dir = Math.random() < 0.5 ? -1 : 1;
      return { img: imgs[idx++], x: Math.random() * (W - cw), y: H * 0.15, vx: dir * (2 + Math.random() * 4), vy: -Math.random() * 6 };
    };
    if (reduced) {
      // Gentle: lay the whole deck out once, no bouncing.
      let n = 0;
      const step = () => {
        if (n >= imgs.length) return;
        const img = imgs[n];
        const draw = () => ctx.drawImage(img, (n * 37) % Math.max(1, W - cw), ((n * 53) % Math.max(1, H - ch)), cw, ch);
        if (img.complete) draw(); else img.onload = draw;
        n++; raf = window.setTimeout(step, 60) as unknown as number;
      };
      step();
      return () => clearTimeout(raf);
    }
    const tick = () => {
      if (!card) card = launch();
      if (card) {
        card.vy += 0.6; card.x += card.vx; card.y += card.vy;
        if (card.y + ch > H) { card.y = H - ch; card.vy = -card.vy * 0.75; }
        if (card.img.complete) ctx.drawImage(card.img, card.x, card.y, cw, ch);
        if (card.x > W || card.x + cw < 0) card = null;
      }
      if (card || idx < imgs.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-label="Card cascade — tap anywhere to close" data-testid="card-waterfall" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, cursor: "pointer", background: "rgba(35, 31, 32, 0.6)" }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>,
    document.body,
  );
}
