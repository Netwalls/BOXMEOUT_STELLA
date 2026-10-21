"use client";

import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import { useToast } from "@/components/ToastProvider";
import { CreateMarketForm, CreateMarketFormData } from "@/components/CreateMarketForm";
import { WalletConnectButton } from "@/components/WalletConnectButton";

export default function CreateMarketPage(): JSX.Element {
  const router = useRouter();
  const { isConnected } = useWallet();
  const { createMarket } = useCreateMarket();
  const { addToast } = useToast();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <p className="text-gray-400">Connect your wallet to create a market.</p>
        <WalletConnectButton onConnected={() => {}} />
      </div>
    );
  }

  async function handleSubmit(data: CreateMarketFormData) {
    try {
      const marketId = await createMarket(data);
      addToast("Market created successfully!", "success");
      router.push(`/markets/${marketId}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create market.", "error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-white">Create Market</h1>
      <CreateMarketForm onSubmit={handleSubmit} />
    </div>
  );
}
