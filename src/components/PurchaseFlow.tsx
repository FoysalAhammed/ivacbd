"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  deviceLimit: number;
  price: number;
  durationDays: number;
}

const BKASH = process.env.NEXT_PUBLIC_BKASH_NUMBER || "01XXXXXXXXX";

export default function PurchaseFlow() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Plan | null>(null);

  useEffect(() => {
    apiGet<{ plans: Plan[] }>("/api/plans")
      .then((d) => setPlans(d.plans))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="pricing" className="container" style={{ padding: "56px 20px" }}>
      <h2 className="center">আপনার জন্য সঠিক Plan বেছে নিন</h2>
      <p className="muted center" style={{ maxWidth: 560, margin: "0 auto 32px" }}>
আপনার কাজের পরিমাণ অনুযায়ী একটি plan বেছে নিয়ে আজই IVAC Slot Automation Pro
 ব্যবহার শুরু করুন।
      </p>

      {loading ? (
        <p className="muted center">Loading plans…</p>
      ) : plans.length === 0 ? (
        <p className="muted center">Plans are not available right now. Please check back shortly.</p>
      ) : (
        <div className="grid-cards">
          {plans.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column" }}>
              <div className="stat-label">{p.name}</div>
              <div style={{ margin: "8px 0" }}>
                <span className="stat-value">৳{p.price.toLocaleString()}</span>
                <span className="muted"> / {p.durationDays} days</span>
              </div>
              <ul className="muted" style={{ paddingLeft: 18, margin: "6px 0 18px", flex: 1 }}>
                <li>{p.deviceLimit} device{p.deviceLimit > 1 ? "s" : ""} (PC)</li>
                <li>Continuous date auto-booking and payment link copy from network Tab</li><br />
<li>Cloudflare ভেরিফিকেশন হ্যান্ডলিং ও দ্রুত ফাইল আপলোড</li> <br />
<li>Extension Setup and Configuration Support</li> <br />
<li>বিশেষ ট্রেনিং টিপস ও কৌশল শেয়ারের জন্য Special প্রাইভেট গ্রুপ</li> <br />
<li>৩ মাসের নিয়মিত আপডেট ও উন্নত ফিচার সাপোর্ট</li><br />
<li>২৪/৭ দ্রুত ও নির্ভরযোগ্য কাস্টমার সাপোর্ট</li><br />
                                                 
              </ul>
              <button className="btn block" onClick={() => setSelected(p)}>
                Buy For {p.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && <PurchaseModal plan={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function PurchaseModal({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    whatsapp: "",
    senderBkashNumber: "",
    transactionId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost("/api/customer/purchase", {
        name: form.name,
        phone: form.phone,
        whatsapp: form.whatsapp || undefined,
        planId: plan.id,
        senderBkashNumber: form.senderBkashNumber,
        transactionId: form.transactionId || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="stack center">
            <h3>Payment submitted ✓</h3>
            <p className="muted">
              We received your request for <strong>{plan.name}</strong>. Once we verify your bKash
              payment, your activation key will be sent to you on WhatsApp/phone. This is usually
              quick during business hours.
            </p>
            <button className="btn block" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="spread row">
              <h3 style={{ margin: 0 }}>Buy {plan.name}</h3>
              <span className="badge">৳{plan.price.toLocaleString()}</span>
            </div>

            <div className="notice" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <strong>Step 1 — Send Money via bKash</strong>
              <br />
              Send <strong>৳{plan.price.toLocaleString()}</strong> to{" "}
              <span className="mono">{BKASH}</span> (Send Money), then enter the details below.
            </div>

            <div className="field">
              <label>Your name</label>
              <input value={form.name} onChange={set("name")} required minLength={2} placeholder="Full name" />
            </div>
            <div className="field">
              <label>Phone (11 digits)</label>
              <input value={form.phone} onChange={set("phone")} required placeholder="017XXXXXXXX" inputMode="numeric" />
            </div>
            <div className="field">
              <label>WhatsApp (optional)</label>
              <input value={form.whatsapp} onChange={set("whatsapp")} placeholder="017XXXXXXXX" inputMode="numeric" />
            </div>
            <div className="field">
              <label>bKash number you paid from</label>
              <input value={form.senderBkashNumber} onChange={set("senderBkashNumber")} required placeholder="017XXXXXXXX" inputMode="numeric" />
            </div>
            <div className="field">
              <label>bKash Transaction ID (TrxID) — optional</label>
              <input value={form.transactionId} onChange={set("transactionId")} placeholder="e.g. 9F3A1B2C7D" style={{ textTransform: "uppercase" }} />
            </div>

            {error && <div className="notice err">{error}</div>}

            <button className="btn block" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit payment for verification"}
            </button>
            <button type="button" className="btn ghost block" onClick={onClose}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
