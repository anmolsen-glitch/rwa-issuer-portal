import { ReactNode, useState } from "react";

/* ---------------- Icons (clean 24px stroke set) ---------------- */
const PATHS: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  building: <><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M14 21V9h4a1 1 0 0 1 1 1v11" /><path d="M8 7h2M8 11h2M8 15h2" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 9v11M15 9v11" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .4-1.8 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  check: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6zM5 7h14M12 4l7 3M12 4L5 7" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  x: <><path d="M18 6L6 18M6 6l12 12" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
  coins: <><ellipse cx="9" cy="6" rx="6" ry="3" /><path d="M3 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3V6" /><path d="M15 9.5c2.4.3 6 1.4 6 3.5v6c0 1.7-2.7 3-6 3-2 0-3.8-.5-5-1.2" /></>,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name] ?? PATHS.list}
    </svg>
  );
}

/* ---------------- helpers ---------------- */
export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const fmt = (n: number) => n.toLocaleString("en-IN");

/* ---------------- primitives ---------------- */
export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="pagehead">
      <div><h2 className="pt">{title}</h2>{sub && <div className="ps">{sub}</div>}</div>
      {actions && <div className="pa">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon, hint, children, pad = true }: { title?: string; icon?: string; hint?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <div className="card">
      {title && <div className="card-h">{icon && <span className="ci"><Icon name={icon} size={16} /></span>}<h3>{title}</h3>{hint && <span className="hint">{hint}</span>}</div>}
      <div className={pad ? "card-b" : ""}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = "" }: { label: string; value: ReactNode; sub?: string; icon: string; tone?: string }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="si"><Icon name={icon} size={18} /></div>
      <div className="sl">{label}</div>
      <div className="sv">{value}</div>
      {sub && <div className="ss">{sub}</div>}
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  approved: "green", success: "green", executed: "green", settled: "green", open: "amber", verified: "green", active: "green",
  pending: "amber", pending_review: "amber", pending_payment: "amber", paused: "amber",
  rejected: "gray", closed: "gray", cancelled: "gray", failure: "red", failed: "red", none: "gray",
};
export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? PILL_TONE[String(children).toLowerCase()] ?? "gray";
  return <span className={`pill ${t}`}>{String(children).replace(/_/g, " ")}</span>;
}

export function Btn({ children, kind = "", sm, block, ...rest }: any) {
  return <button className={`btn ${kind} ${sm ? "sm" : ""} ${block ? "block" : ""}`} {...rest}>{children}</button>;
}

export function Empty({ icon = "list", text }: { icon?: string; text: ReactNode }) {
  return <div className="empty"><div className="eico"><Icon name={icon} size={40} /></div>{text}</div>;
}
export function Loading() { return <div className="loading"><span className="spinner" /> Loading…</div>; }

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>{title}</h3><button className="modal-x" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

/* ---------------- pagination ---------------- */
export function usePaged<T>(rows: T[], size = 8) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages - 1);
  return {
    page: p, setPage, pages, size, total: rows.length,
    slice: rows.slice(p * size, p * size + size),
    from: rows.length ? p * size + 1 : 0,
    to: Math.min((p + 1) * size, rows.length),
  };
}
export function Pager({ p }: { p: any }) {
  if (p.total <= p.size) return null;
  return (
    <div className="pager">
      <span className="muted">{p.from}–{p.to} of {p.total}</span>
      <div className="pager-btns">
        <button className="pgbtn" disabled={p.page === 0} onClick={() => p.setPage(p.page - 1)}>‹</button>
        <span className="pgnum">{p.page + 1} / {p.pages}</span>
        <button className="pgbtn" disabled={p.page >= p.pages - 1} onClick={() => p.setPage(p.page + 1)}>›</button>
      </div>
    </div>
  );
}
