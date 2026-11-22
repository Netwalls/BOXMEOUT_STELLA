import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Risk Disclosure' };

export default function Risk() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1>Risk Disclosure</h1>
      <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>
      <div className="bg-yellow-50 p-4 rounded my-4">
        ⚠️ <strong>Pending legal review</strong> - Placeholder text below.
      </div>
      <div className="bg-red-50 border-l-4 border-red-500 p-4 my-4">
        <strong>You can lose the full amount staked on any bet.</strong> Markets are permissionless and may be resolved incorrectly or maliciously. Thoroughly understand the terms before betting.
      </div>
    </div>
  );
}
