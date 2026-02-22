import React, { useState, useEffect } from "react";
import Navbar from "./components/Layout/Navbar"; // New HUD
import Hero from "./components/Hero/Hero"; // New VS Screen
import MatchGrid from "./components/Matches/MatchGrid"; // New Ladder
import Leaderboard from "./components/Gamification/Leaderboard"; // New High Scores
import UserStats from "./components/Gamification/UserStats";
import ActiveBets from "./components/Gamification/ActiveBets";
import LandingPage from "./components/Landing/LandingPage";
import AboutUs from "./components/Pages/AboutUs";
import ContactUs from "./components/Pages/ContactUs";
import HowItWorks from "./components/Pages/HowItWorks";
import SportCategorySelect from "./components/Onboarding/SportCategorySelect";
import SignIn from "./components/Onboarding/SignIn";
import { MOCK_USER, MOCK_MATCHES, MOCK_LEADERBOARD } from "./data/mockData";

function App() {
  const [view, setView] = useState("LANDING"); // LANDING, SPORT_SELECT, DASHBOARD, ARENA
  const [user, setUser] = useState(MOCK_USER);
  const [matches, setMatches] = useState(MOCK_MATCHES);
  const [activeBets, setActiveBets] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null); // 'wwe', 'boxing', 'mma', etc.

  // Simulate Real-Time Market Fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setMatches((prevMatches) =>
        prevMatches.map((match) => {
          if (match.status !== "LIVE") return match;

          const fluctuation = (Math.random() - 0.5) * 0.1;
          return {
            ...match,
            odds: {
              fighterA: parseFloat(
                (match.odds.fighterA + fluctuation).toFixed(2),
              ),
              fighterB: parseFloat(
                (match.odds.fighterB - fluctuation).toFixed(2),
              ),
            },
          };
        }),
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Filter matches based on selected category (if any)
  const filteredMatches = selectedCategory
    ? matches.filter((m) => {
        if (selectedCategory === "wwe") return m.type === "Wrestling";
        if (selectedCategory === "boxing") return m.type === "Boxing";
        if (selectedCategory === "mma") return m.type === "MMA";
        return true; // Show all for others for now or add more mock data
      })
    : matches;

  // Select first match as featured or one that is LIVE
  const featuredMatch =
    filteredMatches.find((m) => m.status === "LIVE") ||
    filteredMatches[0] ||
    matches[0];
  const upcomingMatches = filteredMatches.filter(
    (m) => m.id !== featuredMatch?.id,
  );

  // Transition from Landing Page to Sign In
  const handleStart = () => {
    setView("SIGN_IN");
  };

  const handleLogin = (email) => {
    setUser((prev) => ({ ...prev, email, username: email.split("@")[0] }));
    setView("SPORT_SELECT");
  };

  const handleSportSelect = (category) => {
    setSelectedCategory(category);
    // Move slightly to Dashboard or Arena?
    // User flow: Select Sport -> Show Matches (Arena)
    // But we probably want to show the Dashboard first as the "Menu"
    setView("ARENA");
  };

  const handlePredict = (match, fighter) => {
    // Record the bet
    const newBet = {
      id: Date.now(),
      fighterName: fighter.name,
      eventName: match.type,
      amount: 100,
      odds:
        fighter.id === match.fighterA.id
          ? match.odds.fighterA
          : match.odds.fighterB,
    };
    setActiveBets((prev) => [newBet, ...prev]);

    setUser((prev) => ({
      ...prev,
      balance: prev.balance - 100,
    }));
  };

  const renderDashboard = () => (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <Navbar user={user} />
      <Hero featuredMatch={featuredMatch} />

      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <button
          className="blink"
          onClick={() => setView("ARENA")}
          style={{
            fontSize: "2rem",
            background: "transparent",
            color: "yellow",
            padding: "1rem 3rem",
            border: "4px solid yellow",
            fontFamily: "var(--font-arcade)",
            cursor: "pointer",
            textTransform: "uppercase",
            boxShadow: "0 0 20px rgba(255, 255, 0, 0.5)",
            transform: "skewX(-10deg)",
          }}
        >
          ENTER ARENA (BET)
        </button>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem" }}
      >
        <UserStats user={user} />
        <Leaderboard users={MOCK_LEADERBOARD} />
      </div>
    </div>
  );

  const renderArena = () => (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <Navbar user={user} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <button
          onClick={() => setView("SPORT_SELECT")} // Back to sport select
          style={{
            background: "transparent",
            color: "#888",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-arcade)",
            fontSize: "1.2rem",
          }}
        >
          &lt; CHANGE SPORT
        </button>

        <div
          style={{
            color: "yellow",
            fontFamily: "var(--font-arcade)",
            fontSize: "1.5rem",
            textTransform: "uppercase",
          }}
        >
          {selectedCategory ? selectedCategory : "ALL SPORTS"} ARENA
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "3rem" }}
      >
        {upcomingMatches.length > 0 ? (
          <MatchGrid matches={upcomingMatches} onPredict={handlePredict} />
        ) : (
          <div
            style={{
              color: "white",
              textAlign: "center",
              padding: "3rem",
              border: "2px dashed #444",
            }}
          >
            NO MATCHES SCHEDULED FOR THIS SPORT
          </div>
        )}
        <ActiveBets bets={activeBets} />
      </div>
    </div>
  );

  return (
    <div className="arcade-screen">
      {view === "LANDING" && (
        <LandingPage onStart={handleStart} onNav={setView} />
      )}
      {view === "SIGN_IN" && <SignIn onSignIn={handleLogin} />}
      {view === "ABOUT" && <AboutUs onNav={setView} />}
      {view === "CONTACT" && <ContactUs onNav={setView} />}
      {view === "HOW_IT_WORKS" && <HowItWorks onNav={setView} />}
      {view === "SPORT_SELECT" && (
        <SportCategorySelect onSelect={handleSportSelect} />
      )}
      {view === "DASHBOARD" && renderDashboard()}
      {view === "ARENA" && renderArena()}
    </div>
  );
}

export default App;
