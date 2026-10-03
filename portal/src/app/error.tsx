"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="page"><h1>The portal could not load.</h1><p>Please refresh. If the problem continues, contact the site owner.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}
