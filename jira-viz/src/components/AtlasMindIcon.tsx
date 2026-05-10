import React from "react";

interface AtlasMindIconProps {
  size?: number;
  className?: string;
}

export default function AtlasMindIcon({
  size = 44,
  className = "",
}: AtlasMindIconProps) {
  const scale = size / 44;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      style={{ display: "block" }}
    >
      {/* Outer circle */}
      <circle
        cx="22"
        cy="22"
        r={17 * scale}
        stroke="#4B6EF5"
        strokeWidth={1.2 * scale}
        fill="none"
      />
      {/* Latitude ellipse */}
      <ellipse
        cx="22"
        cy="22"
        rx={17 * scale}
        ry={7 * scale}
        stroke="#4B6EF5"
        strokeWidth={0.8 * scale}
        fill="none"
        opacity={0.6}
      />
      {/* Meridian ellipse */}
      <ellipse
        cx="22"
        cy="22"
        rx={7 * scale}
        ry={17 * scale}
        stroke="#4B6EF5"
        strokeWidth={0.8 * scale}
        fill="none"
        opacity={0.6}
      />
      {/* Dot at top of globe */}
      <circle cx="22" cy={10 * scale} r={2.5 * scale} fill="#7C9FFF" />
      {/* Ray line */}
      <line
        x1="22"
        y1={10 * scale}
        x2={34 * scale}
        y2={5 * scale}
        stroke="#7C9FFF"
        strokeWidth={1 * scale}
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* Small dot at ray end */}
      <circle cx={35 * scale} cy={4.5 * scale} r={1.5 * scale} fill="#A5BFFF" />
    </svg>
  );
}