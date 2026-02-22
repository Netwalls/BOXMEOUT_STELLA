import React, { useState, useRef } from "react";

const CombatBetButton = ({ label, odds, color, onFire }) => {
  const [charging, setCharging] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);

  const startCharge = () => {
    setCharging(true);
    setProgress(0);
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + 4; // Charge speed
      });
    }, 16); // ~60fps
  };

  const endCharge = () => {
    setCharging(false);
    clearInterval(intervalRef.current);

    if (progress >= 100) {
      onFire(); // Success!
    }
    setProgress(0);
  };

  const cancelCharge = () => {
    setCharging(false);
    clearInterval(intervalRef.current);
    setProgress(0);
  };

  return (
    <button
      className={charging ? "shake-intense" : ""}
      onMouseDown={startCharge}
      onMouseUp={endCharge}
      onMouseLeave={cancelCharge}
      onTouchStart={startCharge}
      onTouchEnd={endCharge}
      style={{
        background: `linear-gradient(to right, ${color} ${progress}%, rgba(255,255,255,0.05) ${progress}%)`,
        border: `2px solid ${color}`,
        padding: "0.8rem", // Slightly larger for interaction
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text-main)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "background 0.05s linear", // smooth fill but fast enough for game feel
        cursor: "pointer",
        position: "relative",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: "0.9rem",
          color: "#ccc",
          textTransform: "uppercase",
          marginBottom: "0.2rem",
        }}
      >
        {charging
          ? progress >= 100
            ? "RELEASE!"
            : "CHARGING..."
          : "HOLD TO STRIKE"}
      </div>
      <div style={{ fontWeight: "bold", fontSize: "1.2rem", color: "white" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "1rem",
          color: color,
          fontWeight: 900,
        }}
      >
        x{odds}
      </div>

      {/* Overcharge Glow */}
      {progress >= 100 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            boxShadow: `inset 0 0 20px ${color}`,
            animation: "pulse-glow 0.2s infinite",
          }}
        ></div>
      )}
    </button>
  );
};

export default CombatBetButton;
