import { EmailLinkConfirmation } from "@/components/email-link-confirmation";
export const dynamic = "force-dynamic";
export default function VerifyLogin() {
  return <main className="login-page"><section className="login-panel">
    <p className="login-brand">Hong Kong PPP Weekly</p><div className="login-rule" />
    <h1>One last step,<br />then you’re in.</h1>
    <EmailLinkConfirmation />
  </section><aside className="login-aside" aria-hidden="true"><div className="editorial-mark">港</div><p>A thoughtful review.<br />A confident delivery.</p><span>Hong Kong · 香港</span></aside></main>;
}
