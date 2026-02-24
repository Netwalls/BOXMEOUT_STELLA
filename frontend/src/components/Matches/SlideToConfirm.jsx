import React, { useState, useRef, useEffect } from "react";

const SlideToConfirm = ({
  label,
  odds,
  color,
  onConfirm,
  stakes = "standard", // "standard", "high", "main-event"
  disabled = false,
}) => {
  const [slideProgress, setSlideProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const sliderRef = useRef(null);
  const startXRef = useRef(0);

  const SLIDE_THRESHOLD = 0.95; // 95% to trigger

  // Stake-based styling
  const getStakeStyle = () => {
    switch (stakes) {
      case "high":
        return {
          border: "3px solid #FFD700",
          boxShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
          glowColor: "#FFD700",
        };
      case "main-event":
        return {
          border: "4px solid #FF4500",
          boxShadow: "0 0 30px rgba(255, 69, 0, 0.8)",
          glowColor: "#FF4500",
          animation: "flame-border 1s infinite",
        };
      default:
        return {
          border: "2px solid #444",
          boxShadow: "none",
          glowColor: color,
        };
    }
  };

  const stakeStyle = getStakeStyle();

  // Gradient based on progress
  const getGradient = () => {
    const startColor = "rgba(20, 20, 20, 0.95)";
    const endColor = slideProgress > 50 ? "#00FFFF" : "#9D4EDD";
    return `linear-gradient(to right, ${endColor} ${slideProgress}%, ${startColor} ${slideProgress}%)`;
  };

  const handleStart = (clientX) => {
    if (disabled || isCompleted) return;
    setIsDragging(true);
    startXRef.current = clientX;
  };

  const handleMove = (clientX) => {
    if (!isDragging || !sliderRef.current) return;

    const sliderRect = sliderRef.current.getBoundingClientRect();
    const sliderWidth = sliderRect.width;
    const thumbWidth = 60; // Width of the draggable thumb
    const maxDistance = sliderWidth - thumbWidth;

    const deltaX = clientX - startXRef.current;
    const progress = Math.max(0, Math.min(100, (deltaX / maxDistance) * 100));

    setSlideProgress(progress);

    // Trigger haptic feedback on mobile
    if (progress >= SLIDE_THRESHOLD * 100 && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (slideProgress >= SLIDE_THRESHOLD * 100) {
      // Success! Trigger impact animation
      setIsCompleted(true);
      setShowImpact(true);

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]);
      }

      // Trigger callback after impact animation
      setTimeout(() => {
        onConfirm();
        setShowImpact(false);
      }, 600);

      // Reset after animation
      setTimeout(() => {
        setIsCompleted(false);
        setSlideProgress(0);
      }, 1000);
    } else {
      // Snap back
      setSlideProgress(0);
    }
  };

  // Mouse events
  const handleMouseDown = (e) => handleStart(e.clientX);
  const handleMouseMove = (e) => handleMove(e.clientX);
  const handleMouseUp = () => handleEnd();

  // Touch events
  const handleTouchStart = (e) => handleStart(e.touches[0].clientX);
  const handleTouchMove = (e) => handleMove(e.touches[0].clientX);
  const handleTouchEnd = () => handleEnd();

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, slideProgress]);

  return (
    <>
      {/* Impact Animation Overlay */}
      {showImpact && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          {/* Ring Shake Effect */}
          <div
            className="ring-shake"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "transparent",
            }}
          />
          {/* Radial Blast */}
          <div
            className="radial-blast"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "100px",
              height: "100px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
              animation: "blast-expand 0.6s ease-out",
            }}
          />
        </div>
      )}

      {/* Slider Container */}
      <div
        ref={sliderRef}
        style={{
          position: "relative",
          width: "100%",
          height: "80px",
          borderRadius: "12px",
          background: getGradient(),
          ...stakeStyle,
          overflow: "hidden",
          userSelect: "none",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "grab",
          transition: isDragging ? "none" : "all 0.3s ease",
        }}
      >
        {/* Background Text */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "1rem",
            fontWeight: "bold",
            color: slideProgress > 50 ? "#000" : "#666",
            textTransform: "uppercase",
            pointerEvents: "none",
            transition: "color 0.2s",
            fontFamily: "var(--font-arcade)",
          }}
        >
          {slideProgress >= SLIDE_THRESHOLD * 100
            ? "RELEASE TO STRIKE!"
            : "SLIDE TO CONFIRM"}
        </div>

        {/* Fighter Info */}
        <div
          style={{
            position: "absolute",
            top: "8px",
            left: "70px",
            fontSize: "0.85rem",
            fontWeight: "bold",
            color: slideProgress > 30 ? "#000" : "#fff",
            pointerEvents: "none",
            transition: "color 0.2s",
          }}
        >
          {label} • x{odds}
        </div>

        {/* Draggable Thumb */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{
            position: "absolute",
            left: `${slideProgress}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "60px",
            height: "60px",
            background: color,
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            cursor: isDragging ? "grabbing" : "grab",
            boxShadow: `0 4px 12px rgba(0,0,0,0.5), 0 0 ${slideProgress / 2}px ${stakeStyle.glowColor}`,
            transition: isDragging ? "none" : "left 0.3s ease, box-shadow 0.2s",
            border: "2px solid rgba(255,255,255,0.3)",
          }}
        >
          {slideProgress >= SLIDE_THRESHOLD * 100 ? "💥" : "🥊"}
        </div>

        {/* Progress Indicator */}
        {slideProgress > 0 && slideProgress < SLIDE_THRESHOLD * 100 && (
          <div
            style={{
              position: "absolute",
              bottom: "4px",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "0.7rem",
              color: slideProgress > 50 ? "#000" : "#fff",
              fontWeight: "bold",
            }}
          >
            {Math.round(slideProgress)}%
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes blast-expand {
          0% {
            width: 100px;
            height: 100px;
            opacity: 1;
          }
          100% {
            width: 800px;
            height: 800px;
            opacity: 0;
          }
        }

        @keyframes flame-border {
          0%,
          100% {
            box-shadow: 0 0 30px rgba(255, 69, 0, 0.8);
          }
          50% {
            box-shadow: 0 0 50px rgba(255, 69, 0, 1);
          }
        }

        .ring-shake {
          animation: ring-shake 0.6s ease-out;
        }

        @keyframes ring-shake {
          0%,
          100% {
            transform: translate(0, 0);
          }
          10% {
            transform: translate(-10px, -10px);
          }
          20% {
            transform: translate(10px, 10px);
          }
          30% {
            transform: translate(-10px, 10px);
          }
          40% {
            transform: translate(10px, -10px);
          }
          50% {
            transform: translate(-5px, -5px);
          }
          60% {
            transform: translate(5px, 5px);
          }
          70% {
            transform: translate(-5px, 5px);
          }
          80% {
            transform: translate(5px, -5px);
          }
          90% {
            transform: translate(-2px, -2px);
          }
        }
      `}</style>
    </>
  );
};

export default SlideToConfirm;
