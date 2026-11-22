import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>
      <div className="bg-yellow-50 p-4 rounded my-4">
        ⚠️ <strong>Pending legal review</strong> - Placeholder text below.
      </div>
      <section>
        <h2>Frontend storage</h2>
        <ul>
          <li>localStorage: watchlist, draft forms, acknowledgements (address-scoped)</li>
          <li>sessionStorage: form drafts</li>
        </ul>
      </section>
      <section>
        <h2>Third parties</h2>
        <ul>
          <li>Freighter wallet (optional)</li>
          <li>Web Vitals endpoint (optional)</li>
        </ul>
      </section>
    </div>
  );
}
