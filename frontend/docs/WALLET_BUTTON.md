# WalletConnectButton Component

The `WalletButton` component in `src/components/layout/WalletButton.tsx` implements the wallet connection functionality.

## Features

- **Disconnected State**: Shows "Connect Wallet" button
- **Connection Flow**: Calls `connectFreighter()` via `useWallet()` hook
- **Connected State**: Displays truncated address and XLM balance
- **Dropdown Menu**: 
  - Copy Address (with feedback)
  - View on Stellar Explorer
  - Disconnect
- **Loading State**: Shows spinner while connecting
- **Error Handling**: Gracefully handles Freighter not installed
- **Keyboard Support**: Escape key closes dropdown

## Usage

```tsx
import { WalletButton } from '@/components/layout/WalletButton';

export function Header() {
  return <WalletButton />;
}
```

## Integration

The component is integrated in the Header and uses:
- `useWallet()` hook for state management
- Zustand store for wallet state persistence
- sessionStorage for address persistence (security)
- Freighter wallet extension for signing
