import React from "react";
import "./LandingFooter.css";

const LandingFooter = ({ onNav }) => {
  return (
    <footer className="landing-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <div
            className="logo"
            onClick={() => onNav("LANDING")}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <img
              src="/logo.jpeg"
              alt="BOXMEOUT Logo"
              style={{ height: "60px", borderRadius: "10px" }}
            />
          </div>
          <p className="brand-tagline">
            The next generation of wrestling prediction markets. Private,
            instant, and decentralized.
          </p>
          <div className="social-links">
            <a href="#" className="social-icon">
              𝕏
            </a>
            <a href="#" className="social-icon">
              Discord
            </a>
            <a href="#" className="social-icon">
              Telegram
            </a>
          </div>
        </div>

        <div className="footer-links">
          <h4>Platform</h4>
          <button
            onClick={() => onNav("HOW_IT_WORKS")}
            className="footer-link-btn"
          >
            How it works
          </button>
          <a href="#features">Markets</a>
          <a href="#leaderboard">Leaderboard</a>
          <a href="#roadmap">Roadmap</a>
        </div>

        <div className="footer-links">
          <h4>Support</h4>
          <button onClick={() => onNav("CONTACT")} className="footer-link-btn">
            Contact Us
          </button>
          <button onClick={() => onNav("ABOUT")} className="footer-link-btn">
            About Us
          </button>
          <a href="#faq">FAQ</a>
          <a href="#docs">Documentation</a>
        </div>

        <div className="footer-links">
          <h4>Legal</h4>
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>&copy; {new Date().getFullYear()} BOXMEOUT. Built on Stellar.</p>
        <div className="system-status">
          <span className="status-dot"></span>
          Soroban Network: Operational
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
