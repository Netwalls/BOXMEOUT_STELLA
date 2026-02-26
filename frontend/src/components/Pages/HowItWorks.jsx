import React, { useEffect } from "react";
import LandingNavbar from "../Landing/LandingNavbar";
import LandingFooter from "../Landing/LandingFooter";
import "./HowItWorks.css";

const HowItWorks = ({ onNav }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="page-wrapper hiw-page">
      <LandingNavbar onStart={() => onNav("SIGN_IN")} onNav={onNav} />

      <main className="container" style={{ paddingTop: "150px" }}>
        {/* Hero Section */}
        <section className="hiw-hero">
          <span className="hiw-subtitle">The Mechanics of Privacy</span>
          <h1 className="hero-title" style={{ fontSize: "5rem" }}>
            How It <span className="text-gradient">Works</span>
          </h1>
          <p
            className="hero-description"
            style={{ margin: "2rem auto", fontSize: "1.3rem" }}
          >
            BOXMEOUT leverages Stellar's Soroban smart contracts to create a
            trustless, front-run resistant prediction market.
          </p>
        </section>

        {/* The 3-Phase Process */}
        <section className="process-steps">
          <div className="step-card">
            <div className="step-number">1</div>
            <div className="step-content glass-panel">
              <h2 className="step-title">Phase 1: Commit</h2>
              <p className="step-description">
                When you make a prediction, you don't send your choice in plain
                text. Instead, you generate a <strong>Secret Commitment</strong>
                . Your chosen winner is hashed with a unique salt on your local
                device. Only the hash is sent to the blockchain.
              </p>
              <div
                className="partnership-wallet"
                style={{ display: "inline-block", marginTop: "1rem" }}
              >
                Hash: 0x8f2...a41 (Choice Encrypted)
              </div>
            </div>
          </div>

          <div className="step-card">
            <div className="step-number">2</div>
            <div className="step-content glass-panel">
              <h2 className="step-title">Phase 2: The Event</h2>
              <p className="step-description">
                As the match takes place in the ring, the market is locked. No
                new commitments can be made. Because all bets are hashed, no one
                (not even validators) can see the distribution of bets,
                preventing market manipulation or "following the whales."
              </p>
            </div>
          </div>

          <div className="step-card">
            <div className="step-number">3</div>
            <div className="step-content glass-panel">
              <h2 className="step-title">Phase 3: Reveal & Settle</h2>
              <p className="step-description">
                Once the event ends, the reveal window opens. You provide your
                original salt to "unlock" your prediction. The smart contract
                verifies the salt matches your original commitment and instantly
                calculates your payout based on the final odds.
              </p>
            </div>
          </div>
        </section>

        {/* Technical Advantages */}
        <section style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h2 className="about-section-title">Why BOXMEOUT?</h2>
          <div className="tech-grid">
            <div className="tech-card glass-panel">
              <div className="tech-icon">🛡️</div>
              <h3>Front-Run Protection</h3>
              <p>
                In standard markets, bots can see your bet and "front-run" you
                to change the odds. Our commitment system makes your bet
                invisible until it's time to settle.
              </p>
            </div>
            <div className="tech-card glass-panel">
              <div className="tech-icon">💸</div>
              <h3>Ultra-Low Fees</h3>
              <p>
                Built on Stellar, transaction fees are a fraction of a cent
                (0.00001 XLM), allowing you to keep 99.9% of your winnings.
              </p>
            </div>
            <div className="tech-card glass-panel">
              <div className="tech-icon">🤝</div>
              <h3>Trustless Payouts</h3>
              <p>
                No central authority holds your funds. Payouts are handled
                automatically by Soroban smart contracts directly to your
                wallet.
              </p>
            </div>
          </div>
        </section>

        {/* Payout Lifecycle */}
        <section className="lifecycle-diagram glass-panel">
          <h3>The Payout Lifecycle</h3>
          <div className="diagram-wrapper">
            <div className="diagram-node">
              <strong>1. Predict</strong>
              <p style={{ fontSize: "0.8rem" }}>100 XLM Locked</p>
            </div>
            <div className="diagram-arrow">➔</div>
            <div className="diagram-node">
              <strong>2. Match Ends</strong>
              <p style={{ fontSize: "0.8rem" }}>Result Confirmed</p>
            </div>
            <div className="diagram-arrow">➔</div>
            <div className="diagram-node">
              <strong>3. Reveal</strong>
              <p style={{ fontSize: "0.8rem" }}>Proof Provided</p>
            </div>
            <div className="diagram-arrow">➔</div>
            <div className="diagram-node">
              <strong>4. Payout</strong>
              <p style={{ fontSize: "0.8rem" }}>XLM + XP Distributed</p>
            </div>
          </div>
        </section>

        {/* Ready CTA */}
        <section style={{ textAlign: "center", marginBottom: "8rem" }}>
          <h2 className="about-section-title">Ready to Predict?</h2>
          <p
            className="about-text"
            style={{ maxWidth: "600px", margin: "0 auto 3rem" }}
          >
            Experience the future of sports entertainment with total privacy and
            instant settlements.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onNav("SIGN_IN")}
          >
            ENTER THE ARENA
          </button>
        </section>
      </main>

      <LandingFooter onNav={onNav} />
    </div>
  );
};

export default HowItWorks;
