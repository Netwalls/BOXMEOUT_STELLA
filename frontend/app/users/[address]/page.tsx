import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// Issue #1528: Public profile page
export async function generateMetadata({ params }): Promise<Metadata> {
  const { address } = await Promise.resolve(params);
  return { title: `Profile - ${address.slice(0, 8)}...` };
}

export default async function ProfilePage({ params }) {
  const { address } = await Promise.resolve(params);
  
  // Validate address
  if (!address || !address.match(/^G[A-Z0-9]{55}$/)) {
    notFound();
  }
  
  try {
    const [user, bets, positions] = await Promise.all([
      fetch(`/api/users/${address}`).then(r => r.json()),
      fetch(`/api/users/${address}/bets`).then(r => r.json()),
      fetch(`/api/users/${address}/positions`).then(r => r.json()),
    ]);
    
    return (
      <div>
        <h1>{user.displayName || address}</h1>
        <p>Bets: {bets.length}</p>
        <p>Win Rate: {user.winRate}%</p>
        <p>ROI: {user.roi}%</p>
      </div>
    );
  } catch (e) {
    notFound();
  }
}
