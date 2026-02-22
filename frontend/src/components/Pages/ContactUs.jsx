import React, { useEffect } from "react";
import LandingNavbar from "../Landing/LandingNavbar";
import LandingFooter from "../Landing/LandingFooter";

const ContactUs = ({ onNav }) => {
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
            Contact <span className="text-gradient">Us</span>
          </h1>
          <p className="hero-description" style={{ margin: "2rem auto" }}>
            Get in touch with the BOXMEOUT team.
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
            <h1>Coming soon</h1>
            <p>Support and inquiries: contact@boxmeout.xyz</p>
          </div>
        </div>
      </main>
      <LandingFooter onNav={onNav} />
    </div>
  );
};

export default ContactUs;
