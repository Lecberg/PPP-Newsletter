import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowGoogle, allowedEmails } from "@/lib/policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" && allowGoogle(profile?.email, profile?.email_verified);
    },
    jwt({ token, account, profile }) {
      if (account) token.portalVerified = account.provider === "google" && allowGoogle(profile?.email, profile?.email_verified);
      return token;
    },
    session({ session, token }) {
      if (token.portalVerified !== true || !allowedEmails().includes(session.user?.email?.toLowerCase() ?? "")) {
        return { ...session, user: { ...session.user, email: null } };
      }
      return session;
    }
  }
});
