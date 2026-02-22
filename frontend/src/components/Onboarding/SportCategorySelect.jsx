import React, { useState } from "react";

const CATEGORIES = [
  {
    id: "wwe",
    name: "PRO WRESTLING",
    desc: "WWE / AEW / NJPW",
    color: "#ff0000",
  },
  {
    id: "boxing",
    name: "BOXING",
    desc: "Heavyweight / Title Bouts",
    color: "#ffff00",
  },
  { id: "mma", name: "MMA", desc: "UFC / Bellator / PFL", color: "#00ff00" },
  {
    id: "olympic",
    name: "OLYMPIC",
    desc: "Freestyle / Greco-Roman",
    color: "#00ffff",
  },
  {
    id: "regional",
    name: "REGIONAL",
    desc: "Sumo / Lucha Libre",
    color: "#ff00ff",
  },
];

const SportCategorySelect = ({ onSelect }) => {
  const [hovered, setHovered] = useState(null);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0b14",
        position: "relative",
        zIndex: 100,
      }}
    >
      <h1
        className="glitch-text"
        data-text="SELECT YOUR SPORT"
        style={{
          fontFamily: "var(--font-arcade)",
          fontSize: "3rem",
          color: "white",
          marginBottom: "3rem",
          textShadow: "4px 4px 0px #333",
        }}
      >
        SELECT YOUR SPORT
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "2rem",
          width: "90%",
          maxWidth: "1200px",
        }}
      >
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            onMouseEnter={() => setHovered(cat.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect(cat.id)}
            style={{
              border: `4px solid ${hovered === cat.id ? cat.color : "#333"}`,
              background:
                hovered === cat.id ? "rgba(255,255,255,0.1)" : "black",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.1s",
              transform: hovered === cat.id ? "scale(1.1)" : "scale(1)",
              position: "relative",
              height: "250px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: hovered === cat.id ? `0 0 30px ${cat.color}` : "none",
            }}
          >
            <div
              style={{
                color: cat.color,
                fontFamily: "var(--font-arcade)",
                fontSize: "1.5rem",
                textAlign: "center",
                marginBottom: "1rem",
              }}
            >
              {cat.name}
            </div>
            <div
              style={{
                color: "#888",
                fontSize: "0.9rem",
                textAlign: "center",
                textTransform: "uppercase",
              }}
            >
              {cat.desc}
            </div>

            {/* Hover visual */}
            {hovered === cat.id && (
              <div
                className="blink"
                style={{
                  position: "absolute",
                  bottom: "1rem",
                  color: "white",
                  fontSize: "0.8rem",
                }}
              >
                PRESS TO START
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Background Noise/Grid */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
          backgroundSize: "100% 2px, 3px 100%",
          pointerEvents: "none",
          zIndex: -1,
        }}
      ></div>
    </div>
  );
};

export default SportCategorySelect;
