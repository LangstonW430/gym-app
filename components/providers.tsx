"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useEffect, type ReactNode } from "react";
import { convex } from "@/lib/convex";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  if (!convex) return <MissingConfig />;
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}

function MissingConfig() {
  return (
    <main className="mx-auto max-w-md p-6 text-sm leading-relaxed">
      <h1 className="mb-2 text-xl font-semibold">Convex isn&apos;t configured</h1>
      <p className="text-muted-foreground">
        Set <code>NEXT_PUBLIC_CONVEX_URL</code> (run <code>npx convex dev</code> locally, or add it in
        Vercel → Project → Settings → Environment Variables) and reload. See SETUP.md.
      </p>
    </main>
  );
}
