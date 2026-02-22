import React, { useEffect } from "react";
import LandingNavbar from "../Landing/LandingNavbar";
import LandingFooter from "../Landing/LandingFooter";

const HowItWorks = ({ onNav }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="page-wrapper">
      <LandingNavbar onStart={() => onNav("SPORT_SELECT")} onNav={onNav} />
      <main
        className="container"
        style={{ paddingTop: "150px", minHeight: "80vh" }}
      >
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 className="hero-title" style={{ fontSize: "4rem" }}>
            How It <span className="text-gradient">Works</span>
          </h1>
          <p className="hero-description" style={{ margin: "2rem auto" }}>
            Learn the mechanics of commitment-reveal privacy on Stellar.
          </p>
        </div>

        <div
          className="glass-panel"
          style={{ padding: "4rem", marginBottom: "8rem" }}
        >
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: "1.2rem",
              lineHeight: "1.8",
            }}
          >
            <p>Step-by-step guide coming soon...</p>
          </div>
        </div>
      </main>
      <LandingFooter onNav={onNav} />
    </div>
  );
};

export default HowItWorks;
