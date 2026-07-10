/**
 * Post-signup wallet onboarding. Shown when the account's wallet mode is
 * still 'unset' - the user must pick a wallet source before using the app.
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import WalletSourceSetup from "@/components/WalletSourceSetup";
import { invalidateWalletModeCache } from "@/lib/walletMode";

export default function WalletSetupPage() {
  const { token, entity } = useAuth();
  const navigate = useNavigate();

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-10 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            bit<span className="text-primary">POS</span>
          </h1>
          {entity && <p className="text-sm text-muted-foreground">@{entity.handle}</p>}
          <h2 className="text-xl font-bold mt-6 mb-1">Choose your wallet</h2>
          <p className="text-sm text-muted-foreground">
            bitPOS never holds your money. Pick where your funds live - you can
            change this later in Settings.
          </p>
        </div>

        <WalletSourceSetup
          token={token}
          onSaved={() => {
            invalidateWalletModeCache();
            navigate("/dashboard", { replace: true });
          }}
        />
      </div>
    </div>
  );
}
