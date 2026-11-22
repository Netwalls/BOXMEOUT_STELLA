import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How it works' };

export default function HowItWorks() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1>How it works</h1>
      <section>
        <h2>Connect wallet</h2>
        <p>Sign in with Freighter to access your markets and positions.</p>
      </section>
      <section>
        <h2>Pick a side</h2>
        <p>Choose YES or NO on the outcome you believe will occur.</p>
      </section>
      <section>
        <h2>Pool-based odds</h2>
        <p>Odds are determined by the total amount bet on each side. Early bettors get better odds.</p>
      </section>
      <section>
        <h2>Protocol fee</h2>
        <p>A small fee is taken from winnings. See contract docs for exact percentage.</p>
      </section>
      <section>
        <h2>Oracle resolution</h2>
        <p>Markets are resolved by an oracle once the event concludes.</p>
      </section>
      <section>
        <h2>Dispute window</h2>
        <p>After resolution, there is a window to dispute the outcome if you disagree.</p>
      </section>
      <section>
        <h2>Claiming and refunds</h2>
        <p>Withdraw your winnings or reclaim your stake after the dispute window closes.</p>
      </section>
    </div>
  );
}
