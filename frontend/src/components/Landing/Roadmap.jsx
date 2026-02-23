import React from "react";
import "./Roadmap.css";

const Roadmap = () => {
  const phases = [
    {
      version: "V1",
      title: "Foundation",
      status: "Current",
      items: [
        "Core Betting Mechanics",
        "Commitment-Reveal Privacy Engine",
        "Engagement Gamification (XP)",
        "Stellar/Soroban Mainnet Launch",
      ],
    },
    {
      version: "V2",
      title: "Expansion",
      status: "Upcoming",
      items: [
        "Dynamic Odds Aggregator",
        "NFT Achievement Badges",
        "DAO Governance Token",
        "Cross-chain Liquidity Bridges",
      ],
    },
    {
      version: "V3",
      title: "Ecosystem",
      status: "Future",
      items: [
        "Mobile Betting App",
        "Partner API Access",
        "Global Wrestling Event Sponsorships",
        "Predict-to-Earn Rewards",
      ],
    },
  ];

  return (
    <section className="roadmap" id="roadmap">
      <div className="container">
        <h2 className="section-title text-center">Development Journey</h2>

        <div className="roadmap-grid">
          {phases.map((phase, i) => (
            <div
              key={i}
              className={`roadmap-card ${phase.status === "Current" ? "active" : ""}`}
            >
              <div className="phase-badge">{phase.version}</div>
              <h3>{phase.title}</h3>
              <div className="status-label">{phase.status}</div>
              <ul className="roadmap-list">
                {phase.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Roadmap;
