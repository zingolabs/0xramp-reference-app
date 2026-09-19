import { createMockBackend, mockScenarioFromEnv } from "@/wallet/mock-backend";
import { nativeBackend } from "@/wallet/native-backend";
import type { WalletBackend } from "@/wallet/wallet-backend";

export const walletBackend: WalletBackend =
  process.env.EXPO_PUBLIC_WALLET_BACKEND === "mock"
    ? createMockBackend(mockScenarioFromEnv(process.env.EXPO_PUBLIC_MOCK_SCENARIO))
    : nativeBackend;
