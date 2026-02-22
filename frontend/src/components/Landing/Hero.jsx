import React from "react";
import "./Hero.css";

const Hero = ({ onStart }) => {
  return (
    <section className="hero">
      <div className="hero-background">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>
      </div>

      <div className="container hero-content">
        <div className="hero-text">
          <div className="badge">Built on Stellar + Soroban</div>
          <h1 className="hero-title">
            Predict Wrestling. <br />
            <span className="text-gradient">Privately.</span> Instantly.
          </h1>
          <p className="hero-description">
            The world's first private prediction market for wrestling. Zero
            front-running, ultra-low fees, and instant settlements using
            commitment-reveal technology.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary btn-lg" onClick={onStart}>
              Sign In
            </button>
            <button className="btn btn-outline btn-lg" onClick={onStart}>
              Explore Markets
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">3-5s</span>
              <span className="stat-label">Settlement</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">0.00001</span>
              <span className="stat-label">XLM Fee</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">100%</span>
              <span className="stat-label">On-Chain</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="visual-card-stack">
            <div className="visual-card card-3"></div>
            <div className="visual-card card-2"></div>
            <div className="visual-card card-1">
              <div className="card-header">
                <span>LIVE MARKET</span>
                <span className="live-dot"></span>
              </div>
              <div className="card-match">
                <div className="competitor">
                  <div className="comp-avatar">👤</div>
                  <span>Roman Reigns</span>
                </div>
                <div className="vs">VS</div>
                <div className="competitor">
                  <div className="comp-avatar">👤</div>
                  <span>Cody Rhodes</span>
                </div>
              </div>
              <div className="card-prediction">
                <div className="predict-label">CURRENT ODDS</div>
                <div className="odds-bar">
                  <div className="odds-fill odds-a" style={{ width: "65%" }}>
                    65%
                  </div>
                  <div className="odds-fill odds-b" style={{ width: "35%" }}>
                    35%
                  </div>
                </div>
              </div>
              <button className="btn btn-accent btn-block" onClick={onStart}>
                PLACE SECRET BET
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
