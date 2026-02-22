import React, { useState, useEffect } from "react";
import CombatBetButton from "./CombatBetButton";

const MatchCard = ({ match, onPredict }) => {
  const [previousOdds, setPreviousOdds] = useState(match.odds);
  const [damageNumber, setDamageNumber] = useState(null); // { value: 100, id: Date.now() }

  // Monitor odds changes for animation
  useEffect(() => {
    // We update previousOdds when match.odds changes to trigger a re-render
    // but the actual comparison happens in CombatBetButton.
    // To properly show "trend", we need the odds from the LATEST change.
    const timer = setTimeout(() => {
      setPreviousOdds(match.odds);
    }, 100);
    return () => clearTimeout(timer);
  }, [match.odds]);

  const handleCombatBet = (fighter) => {
    // Calculate damage/bet amount (e.g., 100 fixed for now)
    const amount = 100;

    // Show damage number at mouse/touch position or center of card
    setDamageNumber({ value: amount, id: Date.now() });

    // Trigger actual prediction
    onPredict(match, fighter);

    // Clear damage number after animation
    setTimeout(() => setDamageNumber(null), 1000);
  };

  return (
    <div
      style={{
        padding: "0",
        display: "flex",
        flexDirection: "column",
        gap: "0",
        transition: "transform 0.1s steps(2)",
        cursor: "pointer",
        border: "4px solid #333",
        position: "relative",
        background: "#111",
        fontFamily: "var(--font-arcade)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.borderColor = "yellow";
        e.currentTarget.style.zIndex = 10;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = "#333";
        e.currentTarget.style.zIndex = 1;
      }}
    >
      {/* Damage Float Integration */}
      {damageNumber && (
        <div className="damage-number">-{damageNumber.value}</div>
      )}

      {/* Header Bar */}
      <div
        style={{
          background: match.status === "LIVE" ? "red" : "#333",
          color: "white",
          padding: "0.5rem",
          fontSize: "0.8rem",
          display: "flex",
          justifyContent: "space-between",
          fontWeight: "bold",
        }}
      >
        <span>{match.type}</span>
        <span className={match.status === "LIVE" ? "blink" : ""}>
          {match.status === "LIVE"
            ? "● LIVE ROUND"
            : new Date(match.date).toLocaleDateString()}
        </span>
      </div>

      <div style={{ padding: "1.5rem", flex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div
            style={{
              color: "white",
              fontSize: "1.2rem",
              textTransform: "uppercase",
            }}
          >
            {match.fighterA.name}
          </div>
          <div
            style={{
              color: "red",
              fontWeight: 900,
              fontSize: "1.5rem",
              fontStyle: "italic",
            }}
          >
            VS
          </div>
          <div
            style={{
              color: "white",
              fontSize: "1.2rem",
              textTransform: "uppercase",
            }}
          >
            {match.fighterB.name}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <CombatBetButton
            label="P1 WIN"
            odds={match.odds.fighterA}
            color="red"
            onFire={() => handleCombatBet(match.fighterA)}
            prevOdds={previousOdds.fighterA}
          />
          <CombatBetButton
            label="P2 WIN"
            odds={match.odds.fighterB}
            color="blue"
            onFire={() => handleCombatBet(match.fighterB)}
            prevOdds={previousOdds.fighterB}
          />
        </div>
      </div>
    </div>
  );
};

export default MatchCard;
