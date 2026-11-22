import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Use' };

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1>Terms of Use</h1>
      <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>
      <div className="bg-yellow-50 p-4 rounded my-4">
        ⚠️ <strong>Pending legal review</strong> - Placeholder text below.
      </div>
      <p>By using this application, you agree to these terms...</p>
    </div>
  );
}
