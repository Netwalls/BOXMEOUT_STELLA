import React from "react";

const ActiveBets = ({ bets }) => {
  return (
    <div
      style={{
        marginTop: "3rem",
        border: "4px solid #333",
        padding: "1.5rem",
        background: "rgba(0,0,0,0.8)",
        fontFamily: "var(--font-arcade)",
      }}
    >
      <h3
        className="glitch-text"
        data-text="ACTIVE WAGERS"
        style={{
          fontSize: "1.5rem",
          color: "white",
          marginBottom: "1rem",
          textTransform: "uppercase",
        }}
      >
        ACTIVE WAGERS
      </h3>

      {bets.length === 0 ? (
        <div style={{ color: "#666", fontStyle: "italic" }}>
          NO ACTIVE BETS. ENTER THE ARENA!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {bets.map((bet) => (
            <div
              key={bet.id}
              style={{
                borderLeft: "4px solid var(--color-accent)",
                background: "rgba(255,255,255,0.05)",
                padding: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ color: "white", fontWeight: "bold" }}>
                  {bet.fighterName}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>
                  {bet.eventName}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{ color: "var(--color-primary)", fontWeight: "bold" }}
                >
                  {bet.amount} KOC
                </div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>
                  POTENTIAL WIN: {Math.floor(bet.amount * bet.odds)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActiveBets;
