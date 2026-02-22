import React from "react";
import MatchCard from "./MatchCard";

const MatchGrid = ({ matches, onPredict }) => {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <h2
          className="glitch-text"
          data-text="CHALLENGERS"
          style={{
            fontSize: "2rem",
            fontWeight: 900,
            fontFamily: "var(--font-arcade)",
            color: "white",
            textTransform: "uppercase",
          }}
        >
          CHALLENGERS
        </h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          {["ALL", "BOXING", "WRESTLING", "MMA"].map((filter) => (
            <button
              key={filter}
              style={{
                padding: "0.5rem 1rem",
                background: "black",
                color: filter === "ALL" ? "yellow" : "#666",
                border:
                  filter === "ALL" ? "2px solid yellow" : "2px solid #333",
                fontFamily: "var(--font-arcade)",
                cursor: "pointer",
                textTransform: "uppercase",
                fontSize: "0.9rem",
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "2rem",
        }}
      >
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} onPredict={onPredict} />
        ))}
      </div>
    </section>
  );
};

export default MatchGrid;
