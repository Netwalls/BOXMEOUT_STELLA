import React, { useState, useEffect } from "react";
import CombatBetButton from "./CombatBetButton";
import SlideToConfirm from "./SlideToConfirm";

const MatchCard = ({ match, onPredict }) => {
  const [previousOdds, setPreviousOdds] = useState(match.odds);
  const [damageNumber, setDamageNumber] = useState(null); // { value: 100, id: Date.now() }
  const [showSlider, setShowSlider] = useState(null); // null | { fighter, label, odds, color, stakes }

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
    // Determine stakes based on match type or other criteria
    let stakes = "standard";
    if (match.type === "CHAMPIONSHIP" || match.type === "MAIN EVENT") {
      stakes = "main-event";
    } else if (match.type === "CO-MAIN" || match.status === "LIVE") {
      stakes = "high";
    }

    // Show slider for confirmation
    setShowSlider({
      fighter,
      label: fighter.name,
      odds:
        fighter === match.fighterA ? match.odds.fighterA : match.odds.fighterB,
      color: fighter === match.fighterA ? "red" : "blue",
      stakes,
    });
  };

  const handleSliderConfirm = () => {
    if (!showSlider) return;

    // Calculate damage/bet amount (e.g., 100 fixed for now)
    const amount = 100;

    // Show damage number at mouse/touch position or center of card
    setDamageNumber({ value: amount, id: Date.now() });

    // Trigger actual prediction
    onPredict(match, showSlider.fighter);

    // Clear damage number after animation
    setTimeout(() => setDamageNumber(null), 1000);

    // Close slider
    setShowSlider(null);
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

        {/* Slide to Confirm Overlay */}
        {showSlider && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.9)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
            }}
            onClick={() => setShowSlider(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "500px",
                width: "100%",
              }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  marginBottom: "1rem",
                  textAlign: "center",
                  fontFamily: "var(--font-arcade)",
                }}
              >
                CONFIRM YOUR PREDICTION
              </div>
              <div
                style={{
                  color: "#ccc",
                  fontSize: "1rem",
                  marginBottom: "2rem",
                  textAlign: "center",
                }}
              >
                {match.fighterA.name} vs {match.fighterB.name}
              </div>
              <SlideToConfirm
                label={showSlider.label}
                odds={showSlider.odds}
                color={showSlider.color}
                stakes={showSlider.stakes}
                onConfirm={handleSliderConfirm}
              />
              <button
                onClick={() => setShowSlider(null)}
                style={{
                  marginTop: "1.5rem",
                  width: "100%",
                  padding: "0.8rem",
                  background: "transparent",
                  border: "2px solid #666",
                  borderRadius: "8px",
                  color: "#ccc",
                  fontSize: "1rem",
                  cursor: "pointer",
                  fontFamily: "var(--font-arcade)",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchCard;
