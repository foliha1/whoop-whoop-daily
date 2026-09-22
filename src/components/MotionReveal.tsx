import React from "react";
import {
  listEntryDelay,
  motionDelayStyle,
  sectionEntryDelay,
} from "@/lib/animationTiming";

type MotionRevealProps = {
  kind?: "section" | "list" | "small";
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** Layout-neutral presentation wrapper. Children are interactive from mount. */
const MotionReveal: React.FC<MotionRevealProps> = ({
  kind = "section",
  index = 0,
  className,
  style,
  children,
}) => {
  const small = kind === "small";
  const delay = kind === "list" ? listEntryDelay(index) : sectionEntryDelay(index);
  const motionClass = small ? "ww-ui-small-in" : kind === "list" ? "ww-ui-list-in" : "ww-ui-section-in";
  return (
    <div
      className={[motionClass, className].filter(Boolean).join(" ")}
      style={{
        ...motionDelayStyle(delay, small ? "--ww-small-delay" : "--ww-ui-delay"),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default MotionReveal;