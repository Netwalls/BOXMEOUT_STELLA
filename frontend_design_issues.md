# GitHub Issues for Wrestling Prediction Market

## 🚀 Issue 1: [FE] Build Landing Page
**Labels:** `frontend`, `ui/ux`, `priority:high`

### 🎯 Objective
Create a high-converting landing page for the Wrestling Prediction Market built on Stellar using Soroban.

### 📌 Sections Required
#### 1️⃣ Hero
- **Headline:** Predict Wrestling. Privately. Instantly.
- **Value Prop:** Short value proposition explaining privacy and speed.
- **CTAs:** `Connect Wallet` / `Explore Markets`

#### 2️⃣ Problem
**Highlight:**
- Public bets → front-running
- Centralized risks (e.g. FTX collapse)
- High gas fees
- Slow withdrawals
- *Include simple comparison table.*

#### 3️⃣ Core Features
- 🔐 **Commitment–Reveal Privacy**
- ⚡ **3–5 second settlement**
- 💸 **Ultra-low fees** (0.00001 XLM)
- 🎮 **XP & leaderboard system**
- 📜 **On-chain transparency**

#### 4️⃣ Roadmap (Brief)
- **V1:** Core betting + gamification
- **V2:** NFTs, DAO, cross-chain

### ✅ Acceptance Criteria
- [ ] Strong CTA above fold
- [ ] Mobile responsive
- [ ] Clear explanation of value
- [ ] SEO optimized

## 📖 Issue 2: [FE] Build About Us Page
**Labels:** `frontend`, `content`

### 🎯 Objective
Explain the mission, vision, and why this platform exists.

### 📌 Sections Required
#### 1️⃣ Mission
- Build a privacy-first, decentralized prediction market powered by Stellar.

#### 2️⃣ Vision
- Create a transparent, fair, and gamified ecosystem for wrestling fans globally.

#### 3️⃣ Why Stellar?
- Fast finality (3–5s)
- Ultra-low fees
- Native smart contracts via Soroban
- Scalable (1,000+ ops/sec)

#### 4️⃣ Security & Trust
- Rust-based smart contracts
- Oracle staking & slashing
- Multi-sig treasury

### ✅ Acceptance Criteria
- [ ] Clear brand story
- [ ] Technical credibility
- [ ] Professional layout
- [ ] Mobile responsive

## 📬 Issue 3: [FE] Build Contact Us Page
**Labels:** `frontend`, `ui/ux`

### 🎯 Objective
Provide a way for users, creators, and validators to reach the team.

### 📌 Requirements
#### 1️⃣ Contact Form
**Fields:**
- Name
- Email
- Subject (General / Creator / Validator / Support)
- Message

#### 2️⃣ Social Links
- Twitter / X
- Discord
- GitHub

#### 3️⃣ FAQ Link
- Link to documentation page.

#### 4️⃣ Optional
- Wallet address for partnerships
- Support email

### ✅ Acceptance Criteria
- [ ] Form validation
- [ ] Spam protection
- [ ] Mobile responsive
- [ ] Clean UI

## ⚙️ Issue 4: [FE] Build “How It Works” Page
**Labels:** `frontend`, `education`

### 🎯 Objective
Explain the full system flow clearly for bettors, creators, and validators.

### 📌 Sections Required
#### 1️⃣ For Bettors
- Connect wallet
- Submit private commitment (hash)
- Reveal before match
- Oracle verifies result
- Instant payout + XP

#### 2️⃣ For Market Creators
- Create market
- Set deadlines
- Fund liquidity
- Earn fees

#### 3️⃣ For Oracle Validators
- Stake XLM
- Submit match outcomes
- Earn rewards
- Slashing for malicious activity

#### 4️⃣ Technical Overview
**Smart contracts:**
- `MarketFactory`
- `PredictionMarket`
- `PrivacyLayer`
- `OracleAggregator`
- `Treasury`

### ✅ Acceptance Criteria
- [ ] Clear step-by-step explanation
- [ ] Visual flow diagrams (optional)
- [ ] Easy for non-technical users
- [ ] Mobile responsive

## 🏆 Issue 5: [UI/UX Enhancement] "Finisher Slide" Action Trigger
**Labels:** `frontend`, `ui/ux`, `animation`, `priority:medium`

### 🎯 Objective
Implement an intentional gesture trigger for high-stakes predictions to prevent accidental transactions and provide high-fidelity feedback.

### 📌 Key Design Elements
- **Intentional Gesture:** Users must slide an icon (e.g., a wrestling glove or championship belt) from left to right to confirm. This prevents accidental transactions.
- **Haptic & Visual Feedback:** As the user slides, the background of the slider fills with a high-energy gradient (Neon Purple to Cyan).
- **The "Impact" Animation:** Upon reaching the end of the slider, a "Ring Shake" screen effect or a radial "Blast" animation triggers, signaling that the transaction has been sent to the Stellar network.
- **Tiered Styles:** The slider’s visual intensity can change based on the stakes (e.g., a "Main Event" prediction has a flaming or glowing border).