import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import React from "react";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import RecoverPage from "@/pages/RecoverPage";
import DashboardPage from "@/pages/DashboardPage";
import SendPage from "@/pages/SendPage";
import ReceivePage from "@/pages/ReceivePage";
import CardPage from "@/pages/CardPage";
import SwapPage from "@/pages/SwapPage";
import BusinessPage from "@/pages/BusinessPage";
import PosPage from "@/pages/business/PosPage";
import PayrollPage from "@/pages/business/PayrollPage";
import InvoicesPage from "@/pages/business/InvoicesPage";
import ReportsPage from "@/pages/business/ReportsPage";
import PosBoxPage from "@/pages/business/PosBoxPage";
import MaekobEmbedPage from "@/pages/business/MaekobEmbedPage";
import SettingsPage from "@/pages/SettingsPage";
import PayPage from "@/pages/PayPage";
import NotFound from "@/pages/not-found";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
          <p className="text-sm text-destructive font-medium">Something went wrong. Please refresh the page.</p>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/recover" element={<PublicRoute><RecoverPage /></PublicRoute>} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout active="wallet"><DashboardPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/send" element={<ProtectedRoute><SendPage /></ProtectedRoute>} />
      <Route path="/receive" element={<ProtectedRoute><ReceivePage /></ProtectedRoute>} />
      <Route path="/bolt-card" element={
        <ProtectedRoute>
          <Layout active="card"><CardPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/swap" element={<ProtectedRoute><SwapPage /></ProtectedRoute>} />
      <Route path="/business/pos" element={<ProtectedRoute><PosPage /></ProtectedRoute>} />
      <Route path="/business/payroll" element={
        <ProtectedRoute>
          <Layout active="business"><PayrollPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/business/invoices" element={
        <ProtectedRoute>
          <Layout active="business"><InvoicesPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/business/reports" element={
        <ProtectedRoute>
          <Layout active="business"><ReportsPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/business/card-shop" element={
        <ProtectedRoute>
          <Layout active="business"><MaekobEmbedPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/business/pos-box" element={
        <ProtectedRoute>
          <Layout active="business"><PosBoxPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/business" element={
        <ProtectedRoute>
          <Layout active="business"><BusinessPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Layout active="settings"><SettingsPage /></Layout>
        </ProtectedRoute>
      } />
      {/* Public PIN authorization page - no auth required, accessible on POS device */}
      <Route path="/pay/:sessionId" element={<PayPage />} />
      <Route path="/" element={<Navigate to="/business/pos" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRouter />
            </BrowserRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
