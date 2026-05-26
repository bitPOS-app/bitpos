import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { EntityInfo, AccountInfo } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthState {
  token: string | null;
  entity: EntityInfo | null;
  account: AccountInfo | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string, entity: EntityInfo, account: AccountInfo) => void;
  updateAccount: (account: AccountInfo) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let _tokenRef: string | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    entity: null,
    account: null,
    loading: true,
  });

  useEffect(() => {
    setAuthTokenGetter(() => _tokenRef);

    fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("No session");
        return r.json() as Promise<{ token: string; entity: EntityInfo; account: AccountInfo }>;
      })
      .then((data) => {
        _tokenRef = data.token;
        setState({ token: data.token, entity: data.entity, account: data.account, loading: false });
      })
      .catch(() => {
        _tokenRef = null;
        setState({ token: null, entity: null, account: null, loading: false });
      });

    return () => {
      setAuthTokenGetter(null);
    };
  }, []);

  const setAuth = useCallback((token: string, entity: EntityInfo, account: AccountInfo) => {
    _tokenRef = token;
    setState({ token, entity, account, loading: false });
  }, []);

  const updateAccount = useCallback((account: AccountInfo) => {
    setState((s) => ({ ...s, account }));
  }, []);

  const logout = useCallback(() => {
    _tokenRef = null;
    setState({ token: null, entity: null, account: null, loading: false });
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setAuth, updateAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
