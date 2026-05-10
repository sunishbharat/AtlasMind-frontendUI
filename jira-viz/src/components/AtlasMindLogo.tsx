import React from "react";

interface AtlasMindLogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { scale: 0.75, fontSize: 12, taglineSize: 7 },
  md: { scale: 1, fontSize: 16, taglineSize: 9 },
  lg: { scale: 1.25, fontSize: 20, taglineSize: 11 },
};

export default function AtlasMindLogo({
  size = "md",
  showTagline = true,
  className = "",
}: AtlasMindLogoProps) {
  const { scale, fontSize, taglineSize } = sizeMap[size];
  const width = 220 * scale;
  const height = 44 * scale;
  const markSize = 44 * scale;
  const paddingX = 20 * scale;
  const paddingY = 12 * scale;

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#0d1117",
        borderRadius: 10 * scale,
        padding: `${paddingY}px ${paddingX}px`,
        width: width,
        height: height,
        boxSizing: "border-box",
      }}
    >
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 44 44"
        style={{ flexShrink: 0 }}
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

      {/* Wordmark */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: 4 * scale,
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: fontSize,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: -0.3,
              lineHeight: 1,
            }}
          >
            Atlas
          </span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: fontSize,
              fontWeight: 700,
              color: "#4B6EF5",
              letterSpacing: -0.3,
              lineHeight: 1,
            }}
          >
            Mind
          </span>
        </div>
        {showTagline && (
          <span
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: taglineSize,
              color: "#6B7280",
              letterSpacing: "0.12em",
              marginTop: 2 * scale,
            }}
          >
            INSIGHT ENGINE
          </span>
        )}
      </div>
    </div>
  );
}