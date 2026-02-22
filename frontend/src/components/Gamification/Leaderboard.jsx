import React from "react";

const Leaderboard = ({ users }) => {
  return (
    <div
      style={{
        border: "4px solid white",
        padding: "1.5rem",
        background: "black",
        fontFamily: "var(--font-arcade)",
      }}
    >
      <h3
        style={{
          marginBottom: "1.5rem",
          borderBottom: "2px dashed #444",
          paddingBottom: "0.5rem",
          color: "var(--color-primary)",
          textAlign: "center",
          fontSize: "1.5rem",
        }}
      >
        TOP PLAYERS
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{ textAlign: "left", color: "yellow", fontSize: "0.8rem" }}
          >
            <th style={{ padding: "0.5rem" }}>RANK</th>
            <th style={{ padding: "0.5rem" }}>INITIALS</th>
            <th style={{ padding: "0.5rem", textAlign: "right" }}>SCORE</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr
              key={user.id}
              className={index === 0 ? "blink" : ""}
              style={{
                color: index === 0 ? "var(--color-accent)" : "white",
                fontWeight: "bold",
              }}
            >
              <td style={{ padding: "0.8rem 0.5rem" }}>{index + 1}ST</td>
              <td style={{ padding: "0.8rem 0.5rem" }}>
                {user.username.slice(0, 3).toUpperCase()}
              </td>
              <td style={{ padding: "0.8rem 0.5rem", textAlign: "right" }}>
                {user.balance}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          textAlign: "center",
          marginTop: "1rem",
          color: "#666",
          fontSize: "0.8rem",
        }}
      >
        INSERT COIN TO JOIN
      </div>
    </div>
  );
};

export default Leaderboard;
