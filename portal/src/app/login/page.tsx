import { signIn } from "@/auth";
import { allowedEmails } from "@/lib/policy";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ready = allowedEmails().length === 2 && Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  return <main className="login-page"><section className="login-panel">
    <p className="login-brand">Hong Kong PPP Weekly</p><div className="login-rule" />
    <h1>Your newsletter,<br />ready for review.</h1>
    <p>Read the latest draft, manage recipients, and confirm delivery in one private place.</p>
    {error && <p className="notice error" role="alert">Access is limited to the two approved Google accounts. Please use the correct account.</p>}
    {!ready && <p className="notice" role="status">The owner is finishing sign-in setup. Please check back later.</p>}
    <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
      <button className="button primary google-button" disabled={!ready}><span aria-hidden="true" className="google-mark">G</span>Continue with Google</button>
    </form><p className="login-footnote">Private access for the newsletter owner and reviewer.</p>
  </section><aside className="login-aside" aria-hidden="true"><div className="editorial-mark">港</div><p>A thoughtful review.<br />A confident delivery.</p><span>Hong Kong · 香港</span></aside></main>;
}
