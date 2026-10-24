import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "./_generated/dataModel";

// Personal app: if ALLOWED_EMAILS is set on the Convex deployment
// (comma-separated), only those addresses can sign up or sign in.
function checkAllowed(email: string) {
  const allowed = process.env.ALLOWED_EMAILS;
  if (!allowed) return;
  const list = allowed.split(",").map((e) => e.trim().toLowerCase());
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
