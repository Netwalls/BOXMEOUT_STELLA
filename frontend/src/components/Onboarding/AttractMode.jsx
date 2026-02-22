import React from "react";

const AttractMode = ({ onInsertCoin }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "black",
        color: "white",
        fontFamily: "var(--font-arcade)",
        textTransform: "uppercase",
      }}
      onClick={onInsertCoin}
    >
      <div
        style={{
          fontSize: "6rem",
          color: "var(--color-accent)",
          textShadow: "0 0 20px var(--color-accent)",
          marginBottom: "2rem",
          textAlign: "center",
          lineHeight: 1,
        }}
        className="glitch-text"
        data-text="BOXMEOUT"
      >
        BOXMEOUT
      </div>

      <div
        style={{
          fontSize: "2rem",
          marginBottom: "4rem",
          color: "var(--color-primary)",
        }}
      >
        Arcade Edition
      </div>

      <div
        className="blink"
        style={{
          fontSize: "3rem",
          color: "yellow",
          cursor: "pointer",
          padding: "1rem 2rem",
          border: "4px dashed yellow",
        }}
      >
        INSERT COIN
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "2rem",
          fontSize: "1rem",
          color: "#666",
        }}
      >
        CREDITS: 00
      </div>
    </div>
  );
};

export default AttractMode;
