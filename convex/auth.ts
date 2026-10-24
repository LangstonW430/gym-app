import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "./_generated/dataModel";

// Personal app: only addresses in ALLOWED_EMAILS (comma-separated, set on the
// Convex deployment) can sign up or sign in. Fails closed: if the variable is
// missing, nobody can, so a fresh deployment is never open to strangers.
function checkAllowed(email: string) {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) {
    throw new ConvexError("Sign-in is locked: set ALLOWED_EMAILS on the Convex deployment.");
  }
  if (!list.includes(email)) {
    throw new ConvexError("This email is not allowed to use this app.");
  }
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        checkAllowed(email);
        return params.name ? { email, name: String(params.name) } : { email };
      },
    }),
  ],
});
