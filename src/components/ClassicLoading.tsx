import React from "react";
import CardFlipLoader from "@/components/CardFlipLoader";

/**
 * Branded loading screen for the Classic route's lazy chunks: a game card
 * flipping back and forth (see `ww-loading-flip` in index.css) instead of a
 * bare "Loading…" line. Reduced-motion users get the static card back.
 */
const ClassicLoading: React.FC = () => (
  <CardFlipLoader label="Loading WHOOP! WHOOP! Classic" layout="overlay" />
);

export default ClassicLoading;
