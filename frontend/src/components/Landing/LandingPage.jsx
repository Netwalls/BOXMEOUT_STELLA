import React from "react";
import LandingNavbar from "./LandingNavbar";
import Hero from "./Hero";
import Problem from "./Problem";
import Features from "./Features";
import Roadmap from "./Roadmap";
import LandingFooter from "./LandingFooter";
import "./LandingPage.css";

const LandingPage = ({ onStart, onNav }) => {
  return (
    <div className="landing-page-wrapper">
      <LandingNavbar onStart={onStart} onNav={onNav} />
      <Hero onStart={onStart} />
      <Problem />
      <Features onStart={onStart} />
      <Roadmap />
      <LandingFooter onNav={onNav} />

      {/* Floating CTA for Mobile */}
      <div className="mobile-cta-fab">
        <button className="btn btn-primary" onClick={onStart}>
          Predict Now
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
