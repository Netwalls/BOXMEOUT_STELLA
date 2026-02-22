import React from "react";

const Navbar = ({ user }) => {
  // Calculate health bar width based on balance (max 2000 for visual cap)
  const healthPercent = Math.min((user.balance / 2000) * 100, 100);

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "2rem",
        marginBottom: "2rem",
        fontFamily: "var(--font-arcade)",
        textTransform: "uppercase",
        position: "relative",
      }}
    >
      {/* Player 1 Info */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          width: "300px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              border: "4px solid var(--color-primary)",
              overflow: "hidden",
              background: "#333",
            }}
          >
            {/* Avatar placeholder */}
            <div
              style={{
                fontSize: "2rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                color: "var(--color-primary)",
              }}
            >
              {user.username[0]}
            </div>
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: "var(--color-primary)",
              lineHeight: 1,
            }}
          >
            {user.username}
          </div>
        </div>

        {/* Health Bar (Balance) */}
        <div
          style={{
            width: "100%",
            height: "30px",
            background: "#330000",
            border: "4px solid white",
            position: "relative",
            transform: "skewX(-20deg)",
          }}
        >
          <div
            style={{
              width: `${healthPercent}%`,
              height: "100%",
              background:
                "linear-gradient(90deg, #330000 0%, #990000 50%, #ff0000 100%)",
              transition: "width 0.5s ease-out",
            }}
          ></div>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "10px",
              color: "white",
              fontWeight: "bold",
              fontSize: "0.9rem",
              lineHeight: "22px",
              textShadow: "2px 2px 0 #000",
              transform: "skewX(20deg)",
            }}
          >
            K.O. COINS: {user.balance}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <img
          src="/logo.jpeg"
          alt="BOXMEOUT Logo"
          style={{
            height: "80px",
            borderRadius: "10px",
            boxShadow: "0 0 20px rgba(225, 29, 72, 0.3)",
          }}
        />
        <div
          style={{
            background: "rgba(255, 0, 0, 0.2)",
            display: "inline-block",
            padding: "0.2rem 1rem",
            border: "1px solid red",
            color: "red",
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            letterSpacing: "2px",
          }}
        >
          INSERT COIN
        </div>
      </div>

      {/* Top Scores / Rank */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "1.2rem", color: "var(--color-secondary)" }}>
          HIGH SCORE
        </div>
        <div style={{ fontSize: "2rem", color: "white" }}>50000</div>
        <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.5rem" }}>
          RANK: {user.rank}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
