import { Suspense } from "react";
import { HomeContent } from "@/components/HomeContent";

export default function HomePage(): JSX.Element {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
