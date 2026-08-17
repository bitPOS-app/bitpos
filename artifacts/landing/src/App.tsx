import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import Changelog from "@/pages/changelog";
import Status from "@/pages/status";
import PosBox from "@/pages/posbox";
import FeatureApp from "@/pages/features/app";
import FeatureBox from "@/pages/features/box";
import FeatureCards from "@/pages/features/cards";
import Comparison from "@/pages/comparison";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location]);
  return null;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/features/app" component={FeatureApp} />
        <Route path="/features/box" component={FeatureBox} />
        <Route path="/features/cards" component={FeatureCards} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/status" component={Status} />
        <Route path="/posbox" component={PosBox} />
        <Route path="/comparison" component={Comparison} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ScrollToTop />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
