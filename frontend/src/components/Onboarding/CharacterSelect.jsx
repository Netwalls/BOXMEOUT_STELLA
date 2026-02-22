import React, { useState } from "react";
import { FIGHTER_CLASSES } from "../../data/classes";

const CharacterSelect = ({ onSelect }) => {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleSelect = (cls) => {
    setSelected(cls);
    setTimeout(
      () => onSelect({ nickname: "Player 1", fighterClass: cls }),
      1500,
    );
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "2rem",
        fontFamily: "var(--font-arcade)",
      }}
    >
      <h2
        style={{
          fontSize: "3rem",
          textAlign: "center",
          marginBottom: "2rem",
          color: "white",
          textShadow: "4px 4px 0px var(--color-primary)",
        }}
      >
        SELECT YOUR FIGHTER
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          flex: 1,
          alignItems: "center",
        }}
      >
        {FIGHTER_CLASSES.map((cls) => (
          <div
            key={cls.id}
            onMouseEnter={() => setHovered(cls)}
            onClick={() => handleSelect(cls)}
            style={{
              border:
                selected?.id === cls.id
                  ? "4px solid yellow"
                  : hovered?.id === cls.id
                    ? `4px solid ${cls.color}`
                    : "4px solid #333",
              height: "300px",
              background:
                hovered?.id === cls.id ? `rgba(255,255,255,0.1)` : "black",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.1s steps(2)",
              position: "relative",
            }}
          >
            {selected?.id === cls.id && (
              <div
                style={{
                  position: "absolute",
                  fontSize: "2rem",
                  color: "yellow",
                  fontWeight: "bold",
                  background: "black",
                  padding: "0.5rem",
                  transform: "rotate(-10deg)",
                  border: "2px solid yellow",
                  animation: "pulse-glow 0.5s infinite",
                }}
              >
                SELECTED!
              </div>
            )}
            <div
              style={{
                fontSize: "1.5rem",
                color: cls.color,
                marginBottom: "1rem",
              }}
            >
              {cls.name}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#888" }}>
              {cls.archetype}
            </div>
          </div>
        ))}
      </div>

      {hovered && (
        <div
          style={{
            marginTop: "auto",
            border: "4px solid white",
            padding: "1rem",
            background: "black",
            height: "150px",
          }}
        >
          <h3
            style={{
              color: hovered.color,
              fontSize: "1.5rem",
              marginBottom: "0.5rem",
            }}
          >
            {hovered.name}
          </h3>
          <p style={{ color: "white", fontSize: "1.2rem" }}>
            "{hovered.quote}"
          </p>
          <div style={{ marginTop: "0.5rem", color: "yellow" }}>
            BONUS: {hovered.bonus}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterSelect;
