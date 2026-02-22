export const MOCK_USER = {
  id: "user_01",
  username: "KnockoutKing",
  balance: 1000, // Knockout Coins (KOC)
  xp: 450,
  level: 5,
  rank: "Journeyman", // Title based on level
  badges: ["Early Adopter", "First Win"],
};

export const MOCK_MATCHES = [
  {
    id: "m1",
    eventName: "Heavyweight Clash",
    date: "2026-02-14T20:00:00Z",
    type: "Boxing",
    fighterA: {
      id: "f1",
      name: "Anthony Joshua",
      record: "28-3-0",
      image: "https://placehold.co/400x500/101010/FFF?text=AJ",
      isChampion: false,
    },
    fighterB: {
      id: "f2",
      name: "Daniel Dubois",
      record: "21-2-0",
      image: "https://placehold.co/400x500/101010/FFF?text=Dubois",
      isChampion: true,
    },
    odds: {
      fighterA: 1.85,
      fighterB: 1.95,
    },
    status: "LIVE",
  },
  {
    id: "m2",
    eventName: "WrestleMania 42",
    date: "2026-04-05T19:00:00Z",
    type: "Wrestling",
    fighterA: {
      id: "f3",
      name: "Roman Reigns",
      record: "Tribal Chief",
      image: "https://placehold.co/400x500/101010/FFF?text=Roman",
      isChampion: true,
    },
    fighterB: {
      id: "f4",
      name: "The Rock",
      record: "Final Boss",
      image: "https://placehold.co/400x500/101010/FFF?text=Rock",
      isChampion: false,
    },
    odds: {
      fighterA: 1.5,
      fighterB: 2.5,
    },
    status: "UPCOMING",
  },
  {
    id: "m3",
    eventName: "UFC 350",
    date: "2026-03-01T22:00:00Z",
    type: "MMA",
    fighterA: {
      id: "f5",
      name: "Islam Makhachev",
      record: "26-1-0",
      image: "https://placehold.co/400x500/101010/FFF?text=Islam",
      isChampion: true,
    },
    fighterB: {
      id: "f6",
      name: "Arman Tsarukyan",
      record: "22-3-0",
      image: "https://placehold.co/400x500/101010/FFF?text=Arman",
      isChampion: false,
    },
    odds: {
      fighterA: 1.4,
      fighterB: 2.8,
    },
    status: "UPCOMING",
  },
];

export const MOCK_LEADERBOARD = [
  { id: 1, username: "TheChamp", balance: 50000, rank: "Undisputed" },
  { id: 2, username: "KnockoutKing", balance: 12000, rank: "Contender" },
  { id: 3, username: "GlassJaw", balance: 500, rank: "Jobber" },
];
