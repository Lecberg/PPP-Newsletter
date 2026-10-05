import type { NextAuthConfig } from "next-auth";
import { allowEmail } from "./policy";

export const emailAuthCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  signIn({ account, user }) {
    return account?.provider === "brevo" && account.type === "email" && allowEmail(user.email);
  },
  jwt({ token, account, user }) {
    if (account) {
      token.portalAuthMethod = account.provider === "brevo" && account.type === "email" && allowEmail(user.email) ? "email-link" : null;
      token.portalLoginAt = Date.now();
    }
    return token;
  },
  session({ session, token }) {
    const fresh = typeof token.portalLoginAt === "number" && Date.now() - token.portalLoginAt < 8 * 60 * 60 * 1000;
    if (token.portalAuthMethod !== "email-link" || !fresh || !allowEmail(session.user?.email)) {
      return { ...session, user: { ...session.user, email: null } };
    }
    return session;
  },
  redirect({ baseUrl }) { return new URL("/", baseUrl).href; }
};
