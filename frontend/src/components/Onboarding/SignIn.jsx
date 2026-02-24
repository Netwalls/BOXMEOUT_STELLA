import React, { useState } from "react";
import "./SignIn.css";

const SignIn = ({ onSignIn }) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      onSignIn(email);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="signin-container">
      <div className="signin-card glass-panel">
        <div className="signin-logo">
          <img src="/logo.jpeg" alt="BOXMEOUT" />
        </div>
        <h2>Welcome Back, Champ</h2>
        <p>Enter your email to enter the arena.</p>

        <form onSubmit={handleSubmit} className="signin-form">
          <div className="input-group">
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
          >
            {isLoading ? "VANTABLACK Consensus..." : "ENTER ARENA"}
          </button>
        </form>

        <p className="signin-footer">
          By signing in, you agree to our <a href="#">Terms of Service</a>.
        </p>
      </div>

      {/* Background Decor */}
      <div className="signin-bg-decor">
        <div className="decor-orb orb-1"></div>
        <div className="decor-orb orb-2"></div>
      </div>
    </div>
  );
};

export default SignIn;
