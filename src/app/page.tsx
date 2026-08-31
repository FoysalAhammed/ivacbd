import PurchaseFlow from "@/components/PurchaseFlow";
import Image from "next/image";
const PRODUCT = process.env.NEXT_PUBLIC_PRODUCT_NAME || "IVAC Slot Automation Pro";
const BKASH = process.env.NEXT_PUBLIC_BKASH_NUMBER || "01XXXXXXXXX";

const FEATURES = [
  { title: "Automatic date booking", body: "Sweeps every available date across this month and next, retrying until a payment page is reached." },
  { title: "Cloudflare handling", body: "Waits intelligently for the human-verification checkbox before and after each date selection." },
  { title: "Reliable file upload", body: "Uploads the primary applicant first, in order, and cross-checks that every file landed before continuing." },
  { title: "Center & mission match", body: "Auto-selects your configured mission and IVAC center, and pauses with a warning if it can't match." },
  { title: "Payment link capture", body: "Detects the payment redirect/link from the network and surfaces it instantly in the run log." },
  
];

export default function HomePage() {
  return (
    <main>
      {/* header */}
      <header className="container row spread" style={{ padding: "22px 20px" }}>
        <div className="row" style={{ gap: 10 }}>
          <div  />
          <Image
            src="/images/ivacicon.png"
            alt="IVAC Slot Automation Pro interface preview"
            width={50}
            height={50}
            style={{borderRadius: 8,  }}
          />
        
        </div>
        <a className="btn ghost sm" href="#pricing">Get a license</a>
      </header>

      {/* hero: banner left / product info right */}
      <section className="container hero-grid" style={{ padding: "24px 20px 8px" }}>
        <div className="hero-banner">
          {/* Static SVG banner — next/image doesn't optimize SVGs, so a plain img is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/banner.png"
            alt="IVAC Slot Automation Pro interface preview"
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 20 }}
          />
        </div>
        <div className="stack">
          <span className="badge ACTIVE">Chrome Extension · v9.1</span>
          <h1 style={{ fontSize: 40 }}>Book IVAC slots before they vanish.</h1>
          <p className="muted" style={{ fontSize: 17 }}>
            {PRODUCT} runs the whole booking flow for you — file upload, center &amp; mission
            selection, Cloudflare verification, and relentless date retrying — so you reach the
            payment page during the few minutes slots are actually open.
          </p>
          <div className="row wrap">
            <a className="btn" href="#pricing">See plans &amp; buy</a>
            <a className="btn ghost" href="#how">How it works</a>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Manual bKash payment · Activation key delivered after verification
          </p>
        </div>
      </section>

      {/* features */}
      <section id="how" className="container" style={{ padding: "48px 20px" }}>
        <div className="grid-cards">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 style={{ fontSize: 17 }}>{f.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing + purchase */}
      <PurchaseFlow />

      {/* footer */}
      <footer className="container" style={{ padding: "40px 20px", borderTop: "1px solid var(--border)" }}>
        <div className="row spread wrap" style={{ gap: 12 }}>
          <span className="muted">© {new Date().getFullYear()} {PRODUCT}</span>
          <span className="muted">
            Payment (bKash Send Money): <span className="mono">{BKASH}</span>
          </span>
        </div>
      </footer>

      {/* responsive hero via inline style tag (server component, no CSS-in-JS dep) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }
            @media (max-width: 860px) {
              .hero-grid { grid-template-columns: 1fr; }
              .hero-banner { order: 2; }
            }
          `,
        }}
      />
    </main>
  );
}
