import React from "react";
import "./Problem.css";

const Problem = () => {
  return (
    <section className="problem" id="how-it-works">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Why the Old Way is Broken</h2>
          <p className="section-subtitle">
            Centralized platforms and public blockchains aren't built for
            serious prediction markets.
          </p>
        </div>

        <div className="problem-grid">
          <div className="problem-card">
            <div className="problem-icon">📉</div>
            <h3>Front-Running</h3>
            <p>
              Bots see your public prediction on-chain and manipulate odds
              before your transaction even settles.
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">🏦</div>
            <h3>Centralized Risk</h3>
            <p>
              Traditional books can freeze your funds or go bankrupt overnight
              (Remember FTX?).
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">💸</div>
            <h3>Insane Gas Fees</h3>
            <p>Paying $10 for a $50 bet on Ethereum makes zero sense.</p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">⏳</div>
            <h3>Slow Withdrawals</h3>
            <p>
              Wait days for withdrawals on centralized platforms while they
              "process" your request.
            </p>
          </div>
        </div>

        <div className="comparison-table-wrapper glass-panel">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Standard Crypto Betting</th>
                <th className="highlight">BOXMEOUT (Stellar)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Privacy</td>
                <td>Public (Exposed to Front-running)</td>
                <td className="highlight">Commitment-Reveal (100% Private)</td>
              </tr>
              <tr>
                <td>Fees</td>
                <td>$1.00 - $50.00+</td>
                <td className="highlight">0.00001 XLM ($0.000001)</td>
              </tr>
              <tr>
                <td>Settlement</td>
                <td>Minutes / Hours</td>
                <td className="highlight">3 - 5 Seconds</td>
              </tr>
              <tr>
                <td>Custody</td>
                <td>Centralized Exchange</td>
                <td className="highlight">Self-Custody (You own your funds)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default Problem;
