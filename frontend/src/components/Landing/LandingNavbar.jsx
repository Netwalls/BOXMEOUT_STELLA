import React, { useState, useEffect } from "react";
import "./LandingNavbar.css";

const LandingNavbar = ({ onStart, onNav }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`landing-navbar ${scrolled ? "scrolled" : ""}`}>
      <div className="container navbar-content">
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
            style={{ height: "45px", borderRadius: "8px" }}
          />
        </div>
        <div className="nav-links">
          <button
            onClick={() => onNav("HOW_IT_WORKS")}
            className="nav-link-btn"
          >
            How it works
          </button>
          <a href="#features" className="nav-link-btn">
            Features
          </a>
          <a href="#roadmap" className="nav-link-btn">
            Roadmap
          </a>
          <button onClick={() => onNav("ABOUT")} className="nav-link-btn">
            About Us
          </button>
          <button onClick={() => onNav("CONTACT")} className="nav-link-btn">
            Contact
          </button>
        </div>
        <div className="nav-actions">
          <button className="btn btn-outline" onClick={onStart}>
            Explore Markets
          </button>
          <button className="btn btn-primary" onClick={onStart}>
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
};

export default LandingNavbar;
