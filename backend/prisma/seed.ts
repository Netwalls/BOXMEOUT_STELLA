// Seed script for development data
import { PrismaClient, UserTier, MarketCategory, MarketStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.trade.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.share.deleteMany();
  await prisma.market.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.leaderboard.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  console.log('👥 Creating users...');
  const passwordHash = await bcrypt.hash('password123', 12);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@boxmeout.com',
        username: 'admin',
        passwordHash,
        displayName: 'Admin User',
        tier: UserTier.LEGENDARY,
        usdcBalance: 10000,
        xlmBalance: 5000,
        walletAddress: 'GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        emailVerified: true,
        reputationScore: 1000,
      },
    }),
    prisma.user.create({
      data: {
        email: 'john@example.com',
        username: 'john_wrestler',
        passwordHash,
        displayName: 'John the Wrestler',
        tier: UserTier.EXPERT,
        usdcBalance: 5000,
        xlmBalance: 2500,
        walletAddress: 'GJOHN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        emailVerified: true,
        reputationScore: 750,
      },
    }),
    prisma.user.create({
      data: {
        email: 'sarah@example.com',
        username: 'sarah_predictor',
        passwordHash,
        displayName: 'Sarah the Predictor',
        tier: UserTier.ADVANCED,
        usdcBalance: 2500,
        xlmBalance: 1000,
        walletAddress: 'GSARAH123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        emailVerified: true,
        reputationScore: 500,
      },
    }),
    prisma.user.create({
      data: {
        email: 'mike@example.com',
        username: 'mike_newbie',
        passwordHash,
        displayName: 'Mike the Newbie',
        tier: UserTier.BEGINNER,
        usdcBalance: 1000,
        xlmBalance: 500,
        emailVerified: false,
        reputationScore: 100,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // Create markets
  console.log('🏟️  Creating markets...');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const markets = await Promise.all([
    prisma.market.create({
      data: {
        contractAddress: 'CONTRACT_WRESTLEMANIA_2026',
        title: 'WrestleMania 2026: Roman Reigns vs. Cody Rhodes',
        description: 'The biggest match of the year! Will Roman Reigns retain his title or will Cody Rhodes finally finish his story?',
        category: MarketCategory.WRESTLING,
        status: MarketStatus.OPEN,
        creatorId: users[0].id,
        outcomeA: 'Roman Reigns Wins',
        outcomeB: 'Cody Rhodes Wins',
        closingAt: tomorrow,
        totalVolume: 5000,
        participantCount: 25,
        yesLiquidity: 2500,
        noLiquidity: 2500,
      },
    }),
    prisma.market.create({
      data: {
        contractAddress: 'CONTRACT_UFC_300',
        title: 'UFC 300: Jones vs. Aspinall',
        description: 'Heavyweight championship bout between Jon Jones and Tom Aspinall',
        category: MarketCategory.MMA,
        status: MarketStatus.OPEN,
        creatorId: users[0].id,
        outcomeA: 'Jon Jones Wins',
        outcomeB: 'Tom Aspinall Wins',
        closingAt: nextWeek,
        totalVolume: 3000,
        participantCount: 18,
        yesLiquidity: 1800,
        noLiquidity: 1200,
      },
    }),
    prisma.market.create({
      data: {
        contractAddress: 'CONTRACT_BOXING_FURY_USYK',
        title: 'Fury vs. Usyk III - Heavyweight Unification',
        description: 'The trilogy fight for all the heavyweight belts',
        category: MarketCategory.BOXING,
        status: MarketStatus.OPEN,
        creatorId: users[1].id,
        outcomeA: 'Tyson Fury Wins',
        outcomeB: 'Oleksandr Usyk Wins',
        closingAt: nextWeek,
        totalVolume: 8000,
        participantCount: 42,
        yesLiquidity: 4000,
        noLiquidity: 4000,
      },
    }),
    prisma.market.create({
      data: {
        contractAddress: 'CONTRACT_ROYAL_RUMBLE_2026',
        title: 'Royal Rumble 2026 Winner',
        description: 'Who will win the 2026 Royal Rumble and headline WrestleMania?',
        category: MarketCategory.WRESTLING,
        status: MarketStatus.CLOSED,
        creatorId: users[0].id,
        outcomeA: 'CM Punk',
        outcomeB: 'Seth Rollins',
        closingAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        closedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
        totalVolume: 12000,
        participantCount: 67,
        yesLiquidity: 6000,
        noLiquidity: 6000,
      },
    }),
  ]);

  console.log(`✅ Created ${markets.length} markets`);

  // Create predictions
  console.log('🎯 Creating predictions...');
  const predictions = await Promise.all([
    prisma.prediction.create({
      data: {
        userId: users[1].id,
        marketId: markets[0].id,
        commitmentHash: 'hash_john_wrestlemania_1',
        predictedOutcome: 1,
        amountUsdc: 500,
        status: 'REVEALED',
        revealedAt: new Date(),
      },
    }),
    prisma.prediction.create({
      data: {
        userId: users[2].id,
        marketId: markets[0].id,
        commitmentHash: 'hash_sarah_wrestlemania_1',
        predictedOutcome: 0,
        amountUsdc: 300,
        status: 'REVEALED',
        revealedAt: new Date(),
      },
    }),
    prisma.prediction.create({
      data: {
        userId: users[1].id,
        marketId: markets[1].id,
        commitmentHash: 'hash_john_ufc_1',
        predictedOutcome: 1,
        amountUsdc: 750,
        status: 'REVEALED',
        revealedAt: new Date(),
      },
    }),
    prisma.prediction.create({
      data: {
        userId: users[3].id,
        marketId: markets[2].id,
        commitmentHash: 'hash_mike_boxing_1',
        predictedOutcome: 0,
        amountUsdc: 100,
        status: 'COMMITTED',
      },
    }),
  ]);

  console.log(`✅ Created ${predictions.length} predictions`);

  // Create leaderboard entries
  console.log('🏆 Creating leaderboard...');
  await Promise.all([
    prisma.leaderboard.create({
      data: {
        userId: users[0].id,
        globalRank: 1,
        weeklyRank: 1,
        allTimePnl: 5000,
        weeklyPnl: 1200,
        allTimeWinRate: 78.5,
        weeklyWinRate: 85.0,
        predictionCount: 150,
        streakLength: 8,
        streakType: 'WIN',
        lastPredictionAt: new Date(),
      },
    }),
    prisma.leaderboard.create({
      data: {
        userId: users[1].id,
        globalRank: 2,
        weeklyRank: 3,
        allTimePnl: 3500,
        weeklyPnl: 800,
        allTimeWinRate: 72.3,
        weeklyWinRate: 75.0,
        predictionCount: 98,
        streakLength: 5,
        streakType: 'WIN',
        lastPredictionAt: new Date(),
      },
    }),
    prisma.leaderboard.create({
      data: {
        userId: users[2].id,
        globalRank: 5,
        weeklyRank: 2,
        allTimePnl: 1800,
        weeklyPnl: 950,
        allTimeWinRate: 65.8,
        weeklyWinRate: 80.0,
        predictionCount: 45,
        streakLength: 3,
        streakType: 'WIN',
        lastPredictionAt: new Date(),
      },
    }),
  ]);

  console.log('✅ Created leaderboard entries');

  // Create achievements
  console.log('🏅 Creating achievements...');
  await Promise.all([
    prisma.achievement.create({
      data: {
        userId: users[0].id,
        achievementName: 'first_win',
        description: 'Won your first prediction',
        tier: 'BRONZE',
        badgeUrl: '/badges/first_win.png',
      },
    }),
    prisma.achievement.create({
      data: {
        userId: users[0].id,
        achievementName: 'win_streak_10',
        description: 'Achieved a 10-win streak',
        tier: 'GOLD',
        badgeUrl: '/badges/win_streak_10.png',
      },
    }),
    prisma.achievement.create({
      data: {
        userId: users[1].id,
        achievementName: 'first_win',
        description: 'Won your first prediction',
        tier: 'BRONZE',
        badgeUrl: '/badges/first_win.png',
      },
    }),
  ]);

  console.log('✅ Created achievements');

  // Create transactions
  console.log('💰 Creating transactions...');
  await Promise.all([
    prisma.transaction.create({
      data: {
        userId: users[1].id,
        txType: 'DEPOSIT',
        amountUsdc: 1000,
        status: 'CONFIRMED',
        txHash: 'TX_DEPOSIT_JOHN_001',
        fromAddress: users[1].walletAddress!,
        toAddress: 'CONTRACT_TREASURY',
        confirmedAt: new Date(),
      },
    }),
    prisma.transaction.create({
      data: {
        userId: users[2].id,
        txType: 'DEPOSIT',
        amountUsdc: 500,
        status: 'CONFIRMED',
        txHash: 'TX_DEPOSIT_SARAH_001',
        fromAddress: users[2].walletAddress!,
        toAddress: 'CONTRACT_TREASURY',
        confirmedAt: new Date(),
      },
    }),
  ]);

  console.log('✅ Created transactions');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Users: ${users.length}`);
  console.log(`   Markets: ${markets.length}`);
  console.log(`   Predictions: ${predictions.length}`);
  console.log('\n🔐 Test Credentials:');
  console.log('   Email: admin@boxmeout.com');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
