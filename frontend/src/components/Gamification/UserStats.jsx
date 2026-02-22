import React from "react";

const UserStats = ({ user }) => {
  const nextLevelXp = user.level * 100;
  const progress = (user.xp / nextLevelXp) * 100;

  return (
    <div className="glass-panel" style={{ padding: "1.5rem", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "var(--color-card-bg)",
            border: "2px solid var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "1.5rem",
          }}
        >
          {user.username[0]}
        </div>
        <div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            {user.username}
          </div>
          <div style={{ color: "var(--color-secondary)", fontSize: "0.9rem" }}>
            {user.rank}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.9rem",
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>
            Level {user.level}
          </span>
          <span>
            {user.xp} / {nextLevelXp} XP
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: "8px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "var(--color-primary)",
              borderRadius: "var(--radius-full)",
            }}
          ></div>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "1rem",
            borderRadius: "var(--radius-sm)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Balance
          </div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--color-secondary)",
            }}
          >
            {user.balance}
          </div>
        </div>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "1rem",
            borderRadius: "var(--radius-sm)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Badges
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
            {user.badges.length}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserStats;
