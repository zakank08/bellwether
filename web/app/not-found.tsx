import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap not-found">
      <div className="kicker">404</div>
      <h1 className="display" style={{ margin: "8px 0 12px" }}>This race isn’t on the ballot.</h1>
      <p className="muted">The page you’re looking for doesn’t exist. Try the search box above, or start from the forecast.</p>
      <p><Link href="/" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", marginTop: 12 }}>Go to the forecast</Link></p>
    </div>
  );
}
