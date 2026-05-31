import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const APP_ROUTES = [
  "/login", "/signup", "/dashboard", "/send", "/receive",
  "/bolt-card", "/swap", "/settings", "/business", "/pay",
];

function isAppRoute(path: string) {
  return APP_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

export default function NotFound() {
  const [location] = useLocation();

  useEffect(() => {
    if (isAppRoute(location)) {
      window.location.replace("/app" + location);
    }
  }, [location]);

  if (isAppRoute(location)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This page doesn't exist.{" "}
            <a href="/" className="text-primary underline">Go home</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
