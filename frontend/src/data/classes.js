export const FIGHTER_CLASSES = [
  {
    id: "boxer_slugger",
    name: "Iron Power",
    archetype: "Slugger",
    description:
      "Trade speed for devastating knockout power. High risk, high reward.",
    quote: "Everyone has a plan until they get punched in the face.",
    stats: { power: 10, speed: 4, defense: 6 },
    bonus: "150 KOC (Signing Bonus)",
    color: "#ff0055", // Pink/Red
  },
  {
    id: "boxer_outboxer",
    name: "Technical Master",
    archetype: "Out-Boxer",
    description:
      "Hit and don't get hit. Master of defense and counter-punching.",
    quote: "He can't hit what his eyes can't see.",
    stats: { power: 5, speed: 10, defense: 9 },
    bonus: "100 KOC + 50 XP",
    color: "#00f3ff", // Cyan
  },
  {
    id: "wrestler_grappler",
    name: "Mat General",
    archetype: "Grappler",
    description:
      "Control the pace. Dominate the ground game. Relentless pressure.",
    quote: "I'm going to maul you for 25 minutes.",
    stats: { power: 7, speed: 6, defense: 8 },
    bonus: "200 KOC (Grinder Bonus)",
    color: "#00ff9d", // Neon Green
  },
];
