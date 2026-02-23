import React from "react";
import "./Features.css";

const Features = ({ onStart }) => {
  const features = [
    {
      icon: "🔐",
      title: "Commitment–Reveal Privacy",
      description:
        "Bets are hashed and hidden until the event starts. No one, not even the platform, knows your prediction until it's revealed.",
      tag: "Security",
    },
    {
      icon: "⚡",
      title: "3–5 Second Settlement",
      description:
        "Powered by Stellar's lightning-fast consensus. Markets settle instantly as soon as results are confirmed.",
      tag: "Speed",
    },
    {
      icon: "💸",
      title: "Ultra-low Fees",
      description:
        "Transactional costs are practically zero (0.00001 XLM). Trade markets with maximum efficiency.",
      tag: "Economy",
    },
    {
      icon: "🎮",
      title: "XP & Leaderboard System",
      description:
        "Level up your profile, earn exclusive badges, and climb the ranks of the elite wrestling analysts.",
      tag: "Gaming",
    },
    {
      icon: "📜",
      title: "On-chain Transparency",
      description:
        "All market logic is handled by Soroban smart contracts. Verifiable, immutable, and fair.",
      tag: "Trust",
    },
  ];

  return (
    <section className="features" id="features">
      <div className="container">
        <div className="features-inner">
          <div className="features-sticky">
            <h2 className="section-title">
              Engineered for <br />
              <span className="text-gradient">Domination</span>
            </h2>
            <p className="section-subtitle">
              A prediction engine that respects your privacy and rewards your
              expertise.
            </p>
            <button className="btn btn-primary" onClick={onStart}>
              Start Predicting Now
            </button>
          </div>

          <div className="features-scroll">
            {features.map((f, i) => (
              <div key={i} className="feature-item glass-panel">
                <div className="feature-tag">{f.tag}</div>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
