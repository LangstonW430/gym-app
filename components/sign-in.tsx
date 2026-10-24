"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Dumbbell } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Dumbbell className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Gym Tracker</h1>
          <p className="text-sm text-muted-foreground">{flow === "signIn" ? "Sign in to log your training" : "Create your account"}</p>
        </div>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const fd = new FormData(e.currentTarget);
          fd.set("flow", flow);
          try {
            await signIn("password", fd);
          } catch (err) {
            setError(
              flow === "signIn"
                ? "Couldn't sign in. Check your email and password."
                : `Couldn't create the account. ${err instanceof Error && /allowed/i.test(err.message) ? "This email isn't allowed." : "Passwords need 8+ characters; the email may already be registered."}`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {flow === "signUp" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {flow === "signIn" ? "Sign in" : "Create account"}
        </Button>
        <Button type="button" variant="link" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
          {flow === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
        </Button>
      </form>
    </main>
  );
}
