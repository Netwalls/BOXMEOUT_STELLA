import React, { useState } from "react";
import { FIGHTER_CLASSES } from "../../data/classes";

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const [selectedClass, setSelectedClass] = useState(null);

  const handleFinish = () => {
    onComplete({ nickname, fighterClass: selectedClass });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--color-bg-main)",
      }}
    >
      <div className="container" style={{ maxWidth: "900px", width: "100%" }}>
        {/* Step 1: Nickname */}
        {step === 1 && (
          <div
            className="glass-panel"
            style={{
              padding: "3rem",
              textAlign: "center",
              animation: "fadeIn 0.5s",
            }}
          >
            <h2 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
              What's your Ring Name?
            </h2>
            <p
              style={{ color: "var(--color-text-muted)", marginBottom: "2rem" }}
            >
              Every legend needs a name. This is how the world will know you.
            </p>

            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. The Iron Giant"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "2px solid var(--color-primary)",
                color: "white",
                fontSize: "1.5rem",
                padding: "1rem 2rem",
                borderRadius: "var(--radius-full)",
                width: "100%",
                maxWidth: "400px",
                textAlign: "center",
                outline: "none",
                marginBottom: "2rem",
              }}
              onKeyPress={(e) => e.key === "Enter" && nickname && setStep(2)}
            />

            <div>
              <button
                className="btn btn-primary"
                disabled={!nickname}
                style={{ opacity: nickname ? 1 : 0.5 }}
                onClick={() => setStep(2)}
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Choose Style */}
        {step === 2 && (
          <div style={{ animation: "fadeIn 0.5s" }}>
            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
              <h2 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
                Choose Your Path
              </h2>
              <p style={{ color: "var(--color-text-muted)" }}>
                Your fighting style determines your starting bonus and stats.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "2rem",
              }}
            >
              {FIGHTER_CLASSES.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  className="glass-panel"
                  style={{
                    padding: "2rem",
                    cursor: "pointer",
                    border:
                      selectedClass?.id === cls.id
                        ? `2px solid ${cls.color}`
                        : "1px solid transparent",
                    background:
                      selectedClass?.id === cls.id
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(20, 22, 37, 0.7)",
                    transform:
                      selectedClass?.id === cls.id ? "scale(1.05)" : "scale(1)",
                    transition: "all 0.3s ease",
                  }}
                >
                  <h3
                    style={{
                      color: cls.color,
                      fontSize: "1.8rem",
                      textTransform: "uppercase",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {cls.name}
                  </h3>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "0.2rem 0.8rem",
                      borderRadius: "4px",
                      background: cls.color,
                      color: "black",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      marginBottom: "1.5rem",
                    }}
                  >
                    {cls.archetype}
                  </div>

                  <p
                    style={{
                      height: "60px",
                      color: "var(--color-text-muted)",
                      marginBottom: "1.5rem",
                    }}
                  >
                    "{cls.quote}"
                  </p>

                  <div style={{ marginBottom: "1.5rem" }}>
                    {Object.entries(cls.stats).map(([stat, val]) => (
                      <div
                        key={stat}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span
                          style={{
                            width: "70px",
                            textTransform: "capitalize",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {stat}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: "6px",
                            background: "rgba(255,255,255,0.1)",
                            borderRadius: "2px",
                          }}
                        >
                          <div
                            style={{
                              width: `${val * 10}%`,
                              height: "100%",
                              background: cls.color,
                              borderRadius: "2px",
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      paddingTop: "1rem",
                      borderTop: "1px solid rgba(255,255,255,0.1)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span style={{ color: "var(--color-text-muted)" }}>
                      Bonus:
                    </span>{" "}
                    <span style={{ color: "white", fontWeight: "bold" }}>
                      {cls.bonus}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: "3rem" }}>
              <button
                className="btn btn-primary"
                disabled={!selectedClass}
                style={{
                  opacity: selectedClass ? 1 : 0.5,
                  transform: "scale(1.2)",
                }}
                onClick={handleFinish}
              >
                Sign Contract
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
