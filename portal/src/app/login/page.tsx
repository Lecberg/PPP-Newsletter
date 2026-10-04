import { EmailLoginForm } from "@/components/email-login-form";
import { loginReady } from "@/lib/email-login";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ready = loginReady();
  return <main className="login-page"><section className="login-panel">
    <p className="login-brand">Hong Kong PPP Weekly</p><div className="login-rule" />
    <h1>Your newsletter,<br />ready for review.</h1>
    <p>Read the latest draft, manage recipients, and confirm delivery in one private place.</p>
    {error && <p className="notice error" role="alert">Login could not be confirmed. Please request a new email link.</p>}
    {!ready && <p className="notice" role="status">The owner is finishing sign-in setup. Please check back later.</p>}
    <EmailLoginForm ready={ready} /><p className="login-footnote">Private access for the newsletter owner and reviewer.</p>
  </section><aside className="login-aside" aria-hidden="true"><div className="editorial-mark">港</div><p>A thoughtful review.<br />A confident delivery.</p><span>Hong Kong · 香港</span></aside></main>;
}
