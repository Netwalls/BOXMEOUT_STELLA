import React, { useEffect, useRef, useState } from "react";

class Particle {
  constructor(width, height) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = Math.random() * 3;
    this.life = Math.random();
  }

  update(width, height) {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.005;

    if (this.x < 0 || this.x > width) this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
    if (this.life <= 0) {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.life = 1;
    }
  }

  draw(ctx) {
    ctx.fillStyle = `rgba(255, 255, 255, ${this.life * 0.5})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

const LandingPage = ({ onStart }) => {
  const canvasRef = useRef(null);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef();

  // Particle System Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let particles = [];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle(width, height));
    }

    const animate = () => {
      ctx.fillStyle = "rgba(10, 11, 20, 0.2)"; // Trail effect
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p) => {
        p.update(width, height);
        p.draw(ctx);
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Hold to Enter Logic
  useEffect(() => {
    let interval;
    if (holding) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            onStart();
            return 100;
          }
          return prev + 2; // Speed of fill
        });
      }, 20);
    } else {
      // Avoid calling setState synchronously in the effect body
      const timer = setTimeout(() => {
        setProgress(0);
      }, 0);
      return () => {
        clearTimeout(timer);
        if (interval) clearInterval(interval);
      };
    }
    return () => clearInterval(interval);
  }, [holding, onStart]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0b14",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        userSelect: "none",
      }}
      onMouseDown={() => setHolding(true)}
      onMouseUp={() => setHolding(false)}
      onTouchStart={() => setHolding(true)}
      onTouchEnd={() => setHolding(false)}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          pointerEvents: "none", // Allow click-through to container for hold
        }}
      >
        <h1
          className="glitch-text"
          style={{
            fontSize: "8rem",
            lineHeight: 0.8,
            fontWeight: 900,
            textTransform: "uppercase",
            fontStyle: "italic",
            marginBottom: "1rem",
            position: "relative",
            color: "white",
          }}
          data-text="BOXMEOUT"
        >
          BOXMEOUT
        </h1>

        <div
          style={{
            fontSize: "1.2rem",
            letterSpacing: "10px",
            color: "var(--color-primary)",
            textTransform: "uppercase",
            marginBottom: "4rem",
            opacity: 0.8,
          }}
        >
          Predict. Bet. Dominate.
        </div>

        <div
          style={{
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            margin: "0 auto",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -2,
              left: -2,
              right: -2,
              bottom: -2,
              borderRadius: "50%",
              border: "4px solid var(--color-accent)",
              clipPath: `inset(${100 - progress}% 0 0 0)`,
              transition: "clip-path 0.1s linear",
              boxShadow: "0 0 20px var(--color-accent)",
            }}
          ></div>

          <div
            style={{
              textTransform: "uppercase",
              fontWeight: "bold",
              letterSpacing: "2px",
              fontSize: "0.9rem",
            }}
          >
            {holding ? "Hold..." : "Hold to Enter"}
          </div>
        </div>
      </div>

      {/* Scanline/Noise Overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
          backgroundSize: "100% 2px, 3px 100%",
          pointerEvents: "none",
          zIndex: 5,
        }}
      ></div>
    </div>
  );
};

export default LandingPage;
