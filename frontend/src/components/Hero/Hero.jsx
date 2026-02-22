import React from "react";

const Hero = ({ featuredMatch }) => {
  if (!featuredMatch) return null;

  return (
    <section
      style={{
        position: "relative",
        padding: "4rem 0",
        marginBottom: "3rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        fontFamily: "var(--font-arcade)",
        borderBottom: "4px solid #333",
      }}
    >
      {/* VS Screen Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "-50vw",
          right: "-50vw",
          bottom: 0,
          background:
            "linear-gradient(45deg, #0a0b14 25%, #1a1c2e 25%, #1a1c2e 50%, #0a0b14 50%, #0a0b14 75%, #1a1c2e 75%, #1a1c2e 100%)",
          backgroundSize: "40px 40px",
          opacity: 0.1,
          zIndex: -1,
          animation: "slide-bg 20s linear infinite",
        }}
      ></div>

      <div
        style={{
          fontSize: "4rem",
          color: "red",
          fontWeight: 900,
          textShadow: "4px 4px 0 white",
          fontStyle: "italic",
          marginBottom: "2rem",
          animation: "pulse-glow 1s infinite",
        }}
      >
        {featuredMatch.status === "LIVE" ? "ROUND 1" : "NEXT BATTLE"}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "4rem",
          width: "100%",
          maxWidth: "1000px",
        }}
      >
        {/* Fighter A */}
        <div style={{ textAlign: "center", flex: 1 }}>
          <div
            style={{
              width: "200px",
              height: "250px",
              background: "#222",
              border: "4px solid var(--color-primary)",
              margin: "0 auto 1rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Placeholder for character sprite */}
            <div
              style={{
                width: "100%",
                height: "100%",
                background: `url(${featuredMatch.fighterA.image})`,
                backgroundSize: "cover",
              }}
            ></div>
          </div>
          <h2
            style={{
              fontSize: "2rem",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            {featuredMatch.fighterA.name}
          </h2>
          <div style={{ color: "var(--color-primary)", fontSize: "1.2rem" }}>
            {featuredMatch.fighterA.record}
          </div>
        </div>

        {/* VS Badge */}
        <div
          style={{
            fontSize: "5rem",
            color: "yellow",
            fontStyle: "italic",
            fontWeight: 900,
            textShadow: "5px 5px 0 red",
            transform: "rotate(-10deg)",
            zIndex: 10,
          }}
        >
          VS
        </div>

        {/* Fighter B */}
        <div style={{ textAlign: "center", flex: 1 }}>
          <div
            style={{
              width: "200px",
              height: "250px",
              background: "#222",
              border: "4px solid var(--color-accent)",
              margin: "0 auto 1rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: `url(${featuredMatch.fighterB.image})`,
                backgroundSize: "cover",
              }}
            ></div>
          </div>
          <h2
            style={{
              fontSize: "2rem",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            {featuredMatch.fighterB.name}
          </h2>
          <div style={{ color: "var(--color-accent)", fontSize: "1.2rem" }}>
            {featuredMatch.fighterB.record}
          </div>
        </div>
      </div>

      <button
        className="blink"
        style={{
          marginTop: "3rem",
          fontSize: "2rem",
          background: "var(--color-accent)",
          color: "white",
          padding: "1rem 3rem",
          border: "4px solid white",
          fontFamily: "var(--font-arcade)",
          cursor: "pointer",
          textTransform: "uppercase",
          boxShadow: "0 0 20px var(--color-accent)",
          transform: "skewX(-10deg)",
        }}
      >
        FIGHT!
      </button>
    </section>
  );
};

export default Hero;
