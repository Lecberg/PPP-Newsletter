import "server-only";
import NextAuth from "next-auth";
import NeonAdapter from "@auth/neon-adapter";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { emailAuthCallbacks } from "@/lib/auth-callbacks";
import { LINK_SECONDS, LOGIN_PROVIDER, SESSION_SECONDS, sendLoginEmail } from "@/lib/email-login";

// The official adapter uses independent queries. Use Neon's HTTP transport for them.
neonConfig.poolQueryViaFetch = true;
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  // Create the adapter's pool per request, as required by the official Neon guide.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return {
    adapter: NeonAdapter(pool),
    providers: [{
      id: LOGIN_PROVIDER, name: "Email link", type: "email", maxAge: LINK_SECONDS,
      from: "Newsletter portal", server: {},
      generateVerificationToken: () => randomBytes(32).toString("hex"),
      normalizeIdentifier: (email: string) => email.trim().toLowerCase(),
      sendVerificationRequest: ({ identifier, token, expires }) => sendLoginEmail(identifier, token, expires)
    }],
    session: { strategy: "jwt", maxAge: SESSION_SECONDS },
    pages: { signIn: "/login", error: "/login", verifyRequest: "/login" },
    callbacks: emailAuthCallbacks,
    // Default error causes can include the callback URL. Log codes only.
    logger: { error(error) {
      const type = (error as Error & { type?: string }).type;
      console.error("Portal login failed:", type && /^[A-Za-z]{1,60}$/.test(type) ? type : error.name);
    } }
  };
});
