import React, { useEffect } from "react";
import LandingNavbar from "../Landing/LandingNavbar";
import LandingFooter from "../Landing/LandingFooter";
import "./AboutUs.css";

const AboutUs = ({ onNav }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="page-wrapper about-page">
      <LandingNavbar onStart={() => onNav("SPORT_SELECT")} onNav={onNav} />
      <main className="container" style={{ paddingTop: "150px" }}>
        <section className="about-hero">
          <h1 className="hero-title" style={{ fontSize: "5rem" }}>
            The Arena. <br />
            <span className="text-gradient">The Vision.</span>
          </h1>
          <p
            className="hero-description"
            style={{ margin: "2rem auto", fontSize: "1.4rem" }}
          >
            BOXMEOUT is the world's first private prediction market dedicated
            exclusively to the high-stakes world of professional wrestling.
          </p>
        </section>

        <section className="about-grid">
          <div className="about-content">
            <h2 className="about-section-title">Our Story</h2>
            <p className="about-text">
              Born from the neon-soaked lights of the independent wrestling
              circuit and the decentralized promise of the Stellar network,
              BOXMEOUT was created for the lovers of the "squared circle" who
              value both their expertise and their privacy.
            </p>
            <p className="about-text">
              We saw a world where prediction markets were riddled with
              front-running bots and excessive fees. We decided to build a
              platform that puts the power back in the hands of the fans, using
              commitment-reveal technology to ensure every bet is a secret until
              the roar of the crowd signals the winner.
            </p>
          </div>
          <div className="story-visual glass-panel">
            <img src="/wrestling_arena_lobby.png" alt="Wrestling Arena Lobby" />
          </div>
        </section>

        <section className="value-cards">
          <div className="value-card glass-panel">
            <div className="value-icon">🔐</div>
            <h3>Privacy First</h3>
            <p className="about-text" style={{ fontSize: "1rem" }}>
              Your predictions are your own. We leverage Soroban smart contracts
              to keep your moves hidden from prying eyes until the reveal phase.
            </p>
          </div>
          <div className="value-card glass-panel">
            <div className="value-icon">⚡</div>
            <h3>Lightning Consensus</h3>
            <p className="about-text" style={{ fontSize: "1rem" }}>
              Built on Stellar, we offer transaction speeds that keep up with
              the fastest double-leg takedowns in the business.
            </p>
          </div>
          <div className="value-card glass-panel">
            <div className="value-icon">🎮</div>
            <h3>Gamified Glory</h3>
            <p className="about-text" style={{ fontSize: "1rem" }}>
              Climb the leaderboard, earn XP, and prove you're the ultimate
              wrestling analyst in our competitive ecosystem.
            </p>
          </div>
        </section>

        <section className="join-locker-room">
          <h2 className="about-section-title">Join the Locker Room</h2>
          <p
            className="about-text"
            style={{ maxWidth: "600px", margin: "0 auto 3rem" }}
          >
            Whether you're a casual fan or a dedicated tape-trader, there's a
            spot for you in the BOXMEOUT community. Start predicting today and
            dominate the leaderboard.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onNav("SPORT_SELECT")}
          >
            ENTER THE ARENA
          </button>
        </section>
      </main>
      <LandingFooter onNav={onNav} />
    </div>
  );
};

export default AboutUs;
