import { useEffect, useState, useCallback, useRef, useContext, createContext, Fragment, FormEvent } from "react";
import {
  api, setToken, getToken, setOnUnauthorized,
  Admin, Health, TokenInfo, CapTable as CapT, TransferRow, Investor, KycDocument, AmlScreening, OperationRequest, AuditRow, Subscription, Issuer, IssuerDetail, InvestorDetail, LegalCase, Manager,
} from "./api";
import { Icon, PageHead, Card, Stat, Pill, Btn, Empty, Loading, Modal, Field, usePaged, Pager, short, inr } from "./ui";

type View = "overview" | "issuers" | "offerings" | "captable" | "operations" | "investors" | "approvals" | "cases" | "orders" | "audit" | "managers" | "team";
type Flash = (ok: boolean, msg: string) => void;

// Items flagged issuer_admin-only are filtered out of the nav for other roles.
const NAV: { group: string | null; items: [View, string, string][]; role?: string }[] = [
  { group: null, items: [["overview", "Overview", "overview"]] },
  { group: "Assets", items: [["issuers", "Issuers", "building"], ["offerings", "Offerings", "list"], ["captable", "Cap Table", "table"], ["operations", "Operations", "gear"]] },
  { group: "Investors", items: [["investors", "Investors", "users"]] },
  { group: "Compliance", items: [["approvals", "Approvals", "check"], ["cases", "Legal Cases", "scale"], ["audit", "Audit Log", "list"]] },
  { group: "Finance", items: [["orders", "Orders", "receipt"]] },
  { group: "Platform", items: [["managers", "Managers", "users"], ["team", "Team", "shield"]], role: "issuer_admin" },
];
const TITLES: Record<View, string> = { overview: "Overview", issuers: "Issuers", offerings: "Offerings", captable: "Cap Table", operations: "Operations", investors: "Investors", approvals: "Approvals", cases: "Legal Cases", orders: "Orders", audit: "Audit Log", managers: "Managers", team: "Team" };

/* ============ data hook ============ */
function useAsync<T>(fn: () => Promise<T>, deps: any[], initial: T): [T, boolean, string | null] {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    fn().then((d) => alive && setData(d)).catch((e: any) => alive && setError(e?.message ?? "request failed")).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, loading, error];
}

/** Shared banner for failed data fetches — shown instead of the empty state. */
function LoadError({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="banner err" style={{ margin: 14 }}>
      <Icon name="x" size={14} />Couldn't load — {error}.
      {retry && <a onClick={retry} style={{ cursor: "pointer", marginLeft: 6, color: "var(--accent)" }}>Retry</a>}
    </div>
  );
}

/* ============ root ============ */
export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    // Any 401 mid-session (expired/revoked cookie) drops us back to the login
    // screen — same mechanism as the boot check below.
    setOnUnauthorized(() => { setToken(null); setAdmin(null); });
    return () => setOnUnauthorized(null);
  }, []);
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    api.me().then((r) => setAdmin(r.admin)).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);
  if (booting) return <div className="loading" style={{ minHeight: "100vh" }}><span className="spinner" /></div>;
  if (!admin) return <Login onLogin={setAdmin} />;
  const onLogout = () => { api.logout().catch(() => {}); setToken(null); setAdmin(null); };
  // Property managers get a scoped portal (only their properties), not the console.
  if (admin.role === "manager") return <ManagerPortal admin={admin} onLogout={onLogout} />;
  return <Console admin={admin} onLogout={onLogout} />;
}

/* ============ login ============ */
function Login({ onLogin }: { onLogin: (a: Admin) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api.login(email, password); setToken(r.token); onLogin(r.admin); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: "0 0 18px" }}>
          <div className="logo"><Icon name="shield" size={18} /></div>
          <div><div className="name">RWA Control</div><div className="tag">Security-token operations</div></div>
        </div>
        {err && <div className="banner err"><Icon name="x" size={14} />{err}</div>}
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
        <Btn block disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Btn>
      </form>
    </div>
  );
}

/* ============ block-explorer links ============ */
// Network-aware explorer base (from /api/config). Empty on local Hardhat.
const ExplorerCtx = createContext<string>("");

// A transaction hash: real explorer link when the network has one, else the short
// hash (local Hardhat has no explorer). Falls back to a supplied `alt` node.
function TxLink({ hash, alt }: { hash?: string | null; alt?: React.ReactNode }) {
  const explorer = useContext(ExplorerCtx);
  if (!hash) return <>{alt ?? "—"}</>;
  if (explorer) return <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="mono" style={{ color: "var(--blue)", textDecoration: "none" }} title="View on block explorer">{short(hash)} ↗</a>;
  return <span className="mono muted" title={hash}>{short(hash)}</span>;
}

function ExplorerAddr({ addr, alt }: { addr?: string | null; alt?: React.ReactNode }) {
  const explorer = useContext(ExplorerCtx);
  if (!addr) return <>{alt ?? "—"}</>;
  if (explorer) return <a href={`${explorer}/address/${addr}`} target="_blank" rel="noopener noreferrer" className="mono" style={{ color: "var(--blue)", textDecoration: "none" }} title={addr}>{short(addr)} ↗</a>;
  return <span className="mono muted" title={addr}>{short(addr)}</span>;
}

/* ============ console shell ============ */
function Console({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [view, setView] = useState<View>("overview");
  const [health, setHealth] = useState<Health | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [symbol, setSymbol] = useState("");
  const [pending, setPending] = useState(0);
  const [rk, setRk] = useState(0);
  const [explorerUrl, setExplorerUrl] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const flash: Flash = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 5000); };
  const refresh = useCallback(() => setRk((k) => k + 1), []);

  const loadShell = useCallback(async () => {
    const [h, ts, pend] = await Promise.all([api.health().catch(() => null), api.tokens().catch(() => []), api.operations("pending").catch(() => [])]);
    setHealth(h); setTokens(ts); setPending(pend.length); setSymbol((s) => s || ts[0]?.symbol || "");
  }, []);
  useEffect(() => { loadShell(); const id = setInterval(loadShell, 15000); return () => clearInterval(id); }, [loadShell, rk]);
  useEffect(() => { api.config().then((c) => setExplorerUrl(c.explorerUrl)).catch(() => {}); }, []);

  // Two independent things, previously conflated into one "offline" state:
  //   connected — the backend answered at all (null only when the fetch itself failed)
  //   chainOk   — the backend could reach the chain RPC (null `chain` = it couldn't)
  // A throttled RPC used to render as "Backend offline", which sent you off to
  // restart a healthy server. Now only an unreachable backend says that.
  const connected = !!health;
  const chainOk = !!health?.chain;
  const tokenScoped = view === "captable" || view === "operations";

  return (
    <ExplorerCtx.Provider value={explorerUrl}>
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><Icon name="shield" size={17} /></div>
          <div><div className="name">RWA Control</div><div className="tag">Operations console</div></div>
        </div>
        <nav className="nav">
          {NAV.filter((g) => !g.role || g.role === admin.role).map((g, i) => (
            <div key={i}>
              {g.group && <div className="nav-group">{g.group}</div>}
              {g.items.map(([id, label, icon]) => (
                <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
                  <span className="nav-ico"><Icon name={icon} size={17} /></span>{label}
                  {id === "approvals" && pending > 0 && <span className="nav-count">{pending}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <div className="avatar">{admin.email[0].toUpperCase()}</div>
            <div className="who"><div className="em">{admin.email}</div><div className="ro">{admin.role.replace("_", " ")}</div></div>
            <button className="modal-x" onClick={onLogout} title="Sign out"><Icon name="logout" size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{TITLES[view]}</h1>
          <div className="topbar-right">
            {tokenScoped && tokens.length > 0 && <AssetSwitcher tokens={tokens} symbol={symbol} onPick={setSymbol} />}
            <span className="statuschip" title={!connected ? "The backend API is not responding" : !chainOk ? `Backend is up; it cannot reach the chain RPC (${health?.rpc ?? ""})` : undefined}>
              <span className={`dot ${connected && chainOk ? "ok" : "bad"}`} />
              {!connected ? "API offline" : !chainOk ? "chain unreachable" : <>block <b>#{health?.chain?.blockNumber}</b></>}
            </span>
            <button className="btn ghost sm" onClick={refresh}><Icon name="refresh" size={14} /></button>
          </div>
        </div>

        <div className="content">
          {!connected ? (
            <Empty icon="gear" text={<>Backend offline. Start it with <span className="mono">npm run dev</span> in <span className="mono">rwa-token-backend</span>.</>} />
          ) : tokens.length === 0 && view !== "team" && view !== "managers" && view !== "offerings" && view !== "issuers" ? (
            <Empty icon="building" text={<>No assets deployed yet. Use <b>Issuers → Create asset</b>.</>} />
          ) : (
            <>
              {view === "team" && <Team admin={admin} flash={flash} refresh={refresh} rk={rk} />}
              {view === "managers" && <Managers flash={flash} rk={rk} />}
              {view === "overview" && <Overview tokens={tokens} rk={rk} setView={setView} refresh={refresh} />}
              {view === "issuers" && <Issuers flash={flash} refresh={refresh} rk={rk} />}
              {view === "offerings" && <OfferingsView flash={flash} refresh={refresh} rk={rk} />}
              {view === "captable" && <CapTableView symbol={symbol} rk={rk} flash={flash} refresh={refresh} />}
              {view === "operations" && <Operations symbol={symbol} token={tokens.find((t) => t.symbol === symbol) ?? null} flash={flash} refresh={refresh} />}
              {view === "investors" && <Investors flash={flash} refresh={refresh} rk={rk} tokens={tokens} />}
              {view === "approvals" && <Approvals admin={admin} flash={flash} refresh={refresh} rk={rk} />}
              {view === "cases" && <Cases flash={flash} refresh={refresh} rk={rk} tokens={tokens} />}
              {view === "orders" && <Orders rk={rk} refresh={refresh} />}
              {view === "audit" && <AuditView rk={rk} refresh={refresh} />}
            </>
          )}
        </div>
      </main>

      <div className="toast-wrap">{toast && <div className={`toast ${toast.ok ? "ok" : "err"}`}><Icon name={toast.ok ? "check" : "x"} size={15} />{toast.msg}</div>}</div>
    </div>
    </ExplorerCtx.Provider>
  );
}

/* ============ Asset switcher (searchable) ============ */
function AssetSwitcher({ tokens, symbol, onPick }: { tokens: TokenInfo[]; symbol: string; onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = tokens.filter((t) => !q || t.symbol.toLowerCase().includes(q.toLowerCase()) || (t.name ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="asw" ref={ref}>
      <button className="asw-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="building" size={14} />{symbol || "Select asset"}<span className="chev"><Icon name="overview" size={11} /></span>
      </button>
      {open && (
        <div className="asw-pop">
          <div className="asw-search"><input autoFocus placeholder="Search assets…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="asw-list">
            {filtered.length ? filtered.map((t) => (
              <button key={t.symbol} className={`asw-item ${t.symbol === symbol ? "sel" : ""}`} onClick={() => { onPick(t.symbol); setOpen(false); setQ(""); }}>
                <span className="sym">{t.symbol}</span>
                <span className="nm" style={{ flex: 1 }}>{t.name ?? ""}</span>
                {t.symbol === symbol && <Icon name="check" size={14} />}
              </button>
            )) : <div className="asw-empty">No assets match “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Overview ============ */
function Overview({ tokens, rk, setView, refresh }: { tokens: TokenInfo[]; rk: number; setView: (v: View) => void; refresh: () => void }) {
  const [investors, , e1] = useAsync(() => api.investors(), [rk], [] as Investor[]);
  const [offerings, , e2] = useAsync(() => api.offerings(), [rk], [] as any[]);
  const [ops, , e3] = useAsync(() => api.operations(), [rk], [] as OperationRequest[]);
  const [cases, , e4] = useAsync(() => api.cases(), [rk], [] as LegalCase[]);
  const [audit, , e5] = useAsync(() => api.audit(), [rk], [] as AuditRow[]);
  const loadErr = e1 ?? e2 ?? e3 ?? e4 ?? e5;
  const raised = offerings.reduce((s, o) => s + (o.raised || 0), 0);
  const verified = investors.filter((i) => i.verified).length;
  const pending = ops.filter((o) => o.status === "pending").length;
  const openCases = cases.filter((c) => c.status === "open").length;
  return (
    <>
      <PageHead title="Overview" sub="Platform health and activity at a glance" />
      {loadErr && <LoadError error={loadErr} retry={refresh} />}
      <div className="stats">
        <Stat icon="building" label="Assets" value={tokens.length} sub="tokenized" />
        <Stat icon="coins" tone="green" label="Capital raised" value={inr(raised)} sub="across offerings" />
        <Stat icon="users" tone="cyan" label="Investors" value={investors.length} sub={`${verified} verified`} />
        <Stat icon="check" tone="amber" label="Pending approvals" value={pending} sub="awaiting checker" />
        <Stat icon="scale" tone="purple" label="Open cases" value={openCases} sub="compliance" />
      </div>
      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Assets" icon="building" hint={<a onClick={() => setView("captable")} style={{ cursor: "pointer", color: "var(--accent)" }}>view</a>} pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Asset</th><th>Symbol</th><th className="num">Supply</th><th>Status</th></tr></thead>
            <tbody>{tokens.map((t) => (
              <tr key={t.symbol}><td className="strong">{t.name ?? t.symbol}</td><td className="mono">{t.symbol}</td><td className="num">{t.totalSupply ?? "—"}</td><td>{t.paused == null ? <Pill>none</Pill> : t.paused ? <Pill tone="amber">paused</Pill> : <Pill tone="green">active</Pill>}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <Card title="Recent activity" icon="list" hint={<a onClick={() => setView("audit")} style={{ cursor: "pointer", color: "var(--accent)" }}>audit log</a>} pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Action</th><th>By</th><th>Result</th></tr></thead>
            <tbody>{audit.slice(0, 8).map((a) => (
              <tr key={a.id}><td className="strong">{a.action} {a.target && <span className="mono muted">{short(a.target)}</span>}</td><td className="muted">{a.actor_email ?? "investor"}</td><td><Pill>{a.status}</Pill></td></tr>
            ))}{audit.length === 0 && <tr><td colSpan={3}><span className="muted">No activity yet.</span></td></tr>}</tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}

/* ============ Cap Table ============ */
function CapTableView({ symbol, rk, flash, refresh }: { symbol: string; rk: number; flash: Flash; refresh: () => void }) {
  const [cap, loading, capErr] = useAsync(() => api.capTable(symbol), [symbol, rk], null as CapT | null);
  const [transfers] = useAsync(() => api.transfers(symbol), [symbol, rk], [] as TransferRow[]);
  const [offerings] = useAsync(() => api.offerings(), [rk], [] as any[]);
  const offering = offerings.find((o) => o.tokenSymbol === symbol);
  const [reval, setReval] = useState(false);
  const hpg = usePaged(cap?.holders ?? [], 8);
  const tpg = usePaged(transfers, 8);
  return (
    <>
      <PageHead title={`Cap table · ${symbol}`} sub="The securities register — who holds what, served from the indexer" />
      <div className="stats">
        <Stat icon="coins" label="Total supply" value={cap?.totalSupply ?? "—"} sub={symbol} />
        <Stat icon="users" tone="cyan" label="Holders" value={cap ? cap.holderCount : "—"} />
        <Stat icon="table" tone="purple" label="Indexed block" value={cap ? `#${cap.lastIndexedBlock}` : "—"} sub="live" />
      </div>

      {offering && (
        <div style={{ marginTop: 16 }}>
          <Card title="Valuation & yield" icon="coins" hint={<Btn sm onClick={() => setReval(true)}>Revalue</Btn>}>
            <div className="stats" style={{ marginTop: 0 }}>
              <Stat icon="building" label="Current valuation" value={inr(offering.currentValuation)} sub={`issued at ${inr(offering.targetRaise)}`} />
              <Stat icon="coins" tone="green" label="NAV / token" value={inr(offering.navPerToken)} sub={`issued ${inr(offering.pricePerToken)}`} />
              <Stat icon="table" tone={offering.appreciationPct >= 0 ? "green" : "red"} label="Appreciation" value={`${offering.appreciationPct >= 0 ? "+" : ""}${offering.appreciationPct}%`} sub="vs issuance" />
              <Stat icon="receipt" tone="cyan" label="Yield (target / realized)" value={`${offering.targetYieldPct ?? "—"}% / ${offering.realizedYieldPct ?? "—"}%`} sub="realized = income ÷ value" />
            </div>
          </Card>
        </div>
      )}
      {reval && offering && <Modal title={`Revalue ${symbol}`} onClose={() => setReval(false)}><RevalueForm offering={offering} flash={flash} done={() => { setReval(false); refresh(); }} /></Modal>}
      <div style={{ marginTop: 16 }}>
        <Card title="Holders" icon="users" pad={false}>
          {loading ? <Loading /> : capErr ? <LoadError error={capErr} retry={refresh} /> : (cap?.holders.length ? (<>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Wallet</th><th className="num">Balance</th><th style={{ width: 160 }}>Share</th></tr></thead>
              <tbody>{hpg.slice.map((h) => (
                <tr key={h.address}><td className="mono">{short(h.address)}</td><td className="num strong">{h.balance} {symbol}</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="bar" style={{ flex: 1 }}><span style={{ width: `${Math.min(h.percent, 100)}%` }} /></div><span className="muted" style={{ width: 44, textAlign: "right" }}>{h.percent}%</span></div></td></tr>
              ))}</tbody>
            </table></div><Pager p={hpg} />
          </>) : <Empty icon="users" text="No holders yet." />)}
        </Card>
      </div>
      <div className="section-label">Recent transfers</div>
      <Card pad={false}>
        {transfers.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Type</th><th>From → To</th><th className="num">Amount</th><th className="num">Block</th><th>Tx</th></tr></thead>
            <tbody>{tpg.slice.map((t) => (
              <tr key={t.txHash + t.from + t.to}><td><Pill tone={t.kind === "mint" ? "green" : t.kind === "burn" ? "red" : "blue"}>{t.kind}</Pill></td>
                <td className="mono muted">{short(t.from)} → {short(t.to)}</td><td className="num strong">{t.value}</td><td className="num muted">#{t.block}</td><td className="mono muted"><TxLink hash={t.txHash} /></td></tr>
            ))}</tbody>
          </table></div><Pager p={tpg} />
        </>) : <Empty icon="list" text="No transfers yet." />}
      </Card>
    </>
  );
}

function RevalueForm({ offering, flash, done }: { offering: any; flash: Flash; done: () => void }) {
  const [value, setValue] = useState(String(offering.currentValuation ?? offering.targetRaise ?? ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const v = Number(value);
  const tokensTotal = offering.tokensTotal || 0;
  const newNav = tokensTotal > 0 ? Math.round((v / tokensTotal) * 100) / 100 : 0;
  const submit = async () => {
    if (!(v > 0)) { flash(false, "Enter a positive valuation."); return; }
    setBusy(true);
    try { await api.recordValuation(offering.id, v, note || undefined); flash(true, `${offering.tokenSymbol} revalued — NAV now ₹${newNav.toLocaleString("en-IN")}/token`); done(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="banner info" style={{ marginBottom: 12 }}><Icon name="building" size={14} />Record a new appraisal of the total property value. Token supply ({tokensTotal}) is unchanged — only the value per token (NAV) moves. The original issuance price is never touched.</div>
      <Field label="New total property value (₹)"><input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" /></Field>
      <Field label="Note (appraiser / basis)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. annual RICS appraisal" /></Field>
      <div className="muted" style={{ fontSize: 13, margin: "6px 0 12px" }}>New NAV / token: <b>₹{newNav.toLocaleString("en-IN")}</b> (was ₹{(offering.navPerToken ?? 0).toLocaleString("en-IN")})</div>
      <Btn block disabled={busy} onClick={submit}>{busy ? "Recording…" : "Record valuation"}</Btn>
    </div>
  );
}

/* ============ Operations ============ */
function Operations({ symbol, token, flash, refresh }: { symbol: string; token: TokenInfo | null; flash: Flash; refresh: () => void }) {
  return (
    <>
      <PageHead title={`Operations · ${symbol}`} sub="Token-agent powers. ⚖ actions require four-eyes approval; freeze is immediate." />
      <div className="banner info"><Icon name="shield" size={15} />Mint, burn, force-transfer and pause submit to the approval queue. Tag court actions with a case id.</div>
      <div className="grid cols-2">
        <OpCard title="Mint" icon="coins" fields={[["investor", "Investor wallet", "0x…"], ["amount", "Amount", "1000"]]} caseField submit={(v: any) => api.mint(symbol, v)} flash={flash} refresh={refresh} badge="⚖ approval" />
        <OpCard title="Burn" icon="coins" fields={[["wallet", "Holder wallet", "0x…"], ["amount", "Amount", "100"]]} caseField submit={(v: any) => api.burn(symbol, v)} flash={flash} refresh={refresh} badge="⚖ approval" />
        <OpCard title="Force transfer" icon="refresh" fields={[["from", "From", "0x…"], ["to", "To (registered)", "0x…"], ["amount", "Amount", "100"]]} caseField submit={(v: any) => api.forceTransfer(symbol, v)} flash={flash} refresh={refresh} badge="⚖ approval" />
        <FreezeCard symbol={symbol} flash={flash} refresh={refresh} />
        <PauseCard symbol={symbol} paused={!!token?.paused} flash={flash} refresh={refresh} />
        <DistributeCard symbol={symbol} flash={flash} refresh={refresh} />
      </div>
    </>
  );
}
function DistributeCard({ symbol, flash, refresh }: { symbol: string; flash: Flash; refresh: () => void }) {
  const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.distribute(symbol, amount, note); flash(true, `Distributed ${amount} to ${r.holders} holder(s)`); setAmount(""); setNote(""); refresh(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={go}>
      <div className="card-h"><span className="ci"><Icon name="coins" size={16} /></span><h3>Distribute income</h3><span className="hint">rent / dividend</span></div>
      <div className="card-b">
        <Field label="Total amount (₹)"><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" required /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Q1 rent payout" /></Field>
        <Btn block disabled={busy}>{busy ? "Allocating…" : "Declare distribution"}</Btn>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Allocated pro-rata to all {symbol} holders; they claim it in the portal.</div>
      </div>
    </form>
  );
}
function OpCard({ title, icon, fields, caseField, submit, flash, refresh, badge }: any) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r: any = await submit({ ...v, caseId: v.caseId || undefined });
      if (r?.status === "pending") flash(true, `${title} submitted for approval — request #${r.id}`);
      else flash(true, `${title} executed${r?.result?.tx?.hash ? ` · ${short(r.result.tx.hash)}` : ""}`);
      setV({}); refresh();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={go}>
      <div className="card-h"><span className="ci"><Icon name={icon} size={16} /></span><h3>{title}</h3>{badge && <span className="hint">{badge}</span>}</div>
      <div className="card-b">
        {fields.map(([k, label, ph]: any) => <Field key={k} label={label}><input value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={ph} required /></Field>)}
        {caseField && <Field label="Case id (optional)"><input value={v.caseId ?? ""} onChange={(e) => set("caseId", e.target.value)} placeholder="legal case #" /></Field>}
        <Btn block disabled={busy}>{busy ? "Submitting…" : title}</Btn>
      </div>
    </form>
  );
}
function FreezeCard({ symbol, flash, refresh }: { symbol: string; flash: Flash; refresh: () => void }) {
  const [wallet, setWallet] = useState(""); const [busy, setBusy] = useState(false);
  const act = async (frozen: boolean) => { setBusy(true); try { await api.freeze(symbol, wallet, frozen); flash(true, `${frozen ? "Froze" : "Unfroze"} ${short(wallet)}`); refresh(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="card-h"><span className="ci"><Icon name="shield" size={16} /></span><h3>Freeze wallet</h3><span className="hint">immediate</span></div>
      <div className="card-b">
        <Field label="Wallet"><input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" /></Field>
        <div className="row2"><Btn kind="ghost" disabled={busy || !wallet} onClick={() => act(true)}>Freeze</Btn><Btn disabled={busy || !wallet} onClick={() => act(false)}>Unfreeze</Btn></div>
      </div>
    </div>
  );
}
function PauseCard({ symbol, paused, flash, refresh }: { symbol: string; paused: boolean; flash: Flash; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async () => { setBusy(true); try { const r: any = await api.pause(symbol, !paused); flash(true, r?.status === "pending" ? `${paused ? "Unpause" : "Pause"} submitted for approval` : "done"); refresh(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="card-h"><span className="ci"><Icon name="gear" size={16} /></span><h3>{paused ? "Unpause" : "Pause"} trading</h3><span className="hint">⚖ issuer_admin</span></div>
      <div className="card-b">
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{paused ? "Trading is paused — resume transfers for this asset." : "Halt all transfers for this asset. Needs a second issuer_admin to approve."}</div>
        <Btn kind={paused ? "" : "danger"} block disabled={busy} onClick={act}>{busy ? "Submitting…" : paused ? `Unpause ${symbol}` : `Pause ${symbol}`}</Btn>
      </div>
    </div>
  );
}

/* ============ Issuers ============ */
function Issuers({ flash, refresh, rk }: { flash: Flash; refresh: () => void; rk: number }) {
  const [issuers, loading, error] = useAsync(() => api.issuers(), [rk], [] as Issuer[]);
  const [modal, setModal] = useState<null | { kind: "register" } | { kind: "review" | "asset" | "details"; issuer: Issuer }>(null);
  const pg = usePaged(issuers, 8);
  return (
    <>
      <PageHead title="Issuers" sub="SPVs / asset sponsors — KYB onboarding, then deploy assets" actions={<Btn onClick={() => setModal({ kind: "register" })}><Icon name="plus" size={15} />Register issuer</Btn>} />
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : issuers.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Entity</th><th>SPV ID</th><th>SPV type</th><th>Owner wallet</th><th>KYB</th><th></th></tr></thead>
            <tbody>{pg.slice.map((i) => (
              <tr key={i.id}><td><div className="strong">{i.name}</div><div className="muted" style={{ fontSize: 12 }}>{i.details?.jurisdiction ?? "—"}</div></td>
                <td className="mono">{i.spv_id ?? <span className="muted">—</span>}</td>
                <td className="muted">{i.spv_type ?? i.details?.entityType ?? i.legal_entity ?? "—"}</td>
                <td className="mono">{short(i.owner_wallet)}</td><td><Pill>{i.kyb_status}</Pill></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Btn sm kind="ghost" onClick={() => setModal({ kind: "details", issuer: i })}>View details</Btn>{" "}
                  {i.kyb_status === "pending_review" && <Btn sm onClick={() => setModal({ kind: "review", issuer: i })}>Review KYB</Btn>}
                  {i.kyb_status === "approved" && <Btn sm onClick={() => setModal({ kind: "asset", issuer: i })}><Icon name="plus" size={13} />Create asset</Btn>}
                  {i.kyb_status === "rejected" && <Btn sm kind="ghost" onClick={() => setModal({ kind: "review", issuer: i })}>KYB</Btn>}
                </td></tr>
            ))}</tbody>
          </table></div>
          <Pager p={pg} />
        </>) : <Empty icon="building" text="No issuers yet. Register one to start." />}
      </Card>
      {modal?.kind === "register" && <Modal wide title="Issuer onboarding — KYB" onClose={() => setModal(null)}><IssuerWizard flash={flash} done={() => { setModal(null); refresh(); }} /></Modal>}
      {modal?.kind === "review" && <Modal wide title={`KYB review — ${modal.issuer.name}`} onClose={() => setModal(null)}><IssuerReview issuer={modal.issuer} flash={flash} done={() => { setModal(null); refresh(); }} /></Modal>}
      {modal?.kind === "asset" && <Modal title="Create asset" onClose={() => setModal(null)}><CreateAsset issuerId={modal.issuer.id} flash={flash} done={() => { setModal(null); refresh(); }} /></Modal>}
      {modal?.kind === "details" && <Modal wide title={`SPV details — ${modal.issuer.name}`} onClose={() => setModal(null)}><IssuerDetails issuerId={modal.issuer.id} flash={flash} /></Modal>}
    </>
  );
}

/** Label/value pair used by the KYB review and SPV details panels. */
const Row = ({ k, v }: { k: string; v: any }) => <div className="rv"><div className="k">{k}</div><div className="v">{v || "—"}</div></div>;

/* ============ SPV details ============ */
/**
 * Read-only picture of one SPV, plus the one thing that IS editable here: its SPV
 * managers and the property managers reporting to each. Deliberately not a second
 * KYB editor — that stays in IssuerReview, gated on pending_review.
 */
function IssuerDetails({ issuerId, flash }: { issuerId: string; flash: Flash }) {
  const [rk, setRk] = useState(0);
  const reload = () => setRk((k) => k + 1);
  const [data, loading, error] = useAsync(() => api.issuerDetail(issuerId), [issuerId, rk], null as IssuerDetail | null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sm, setSm] = useState({ name: "", company: "", contactEmail: "", phone: "" });

  if (loading) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return null;
  const { issuer, assets, spvManagers, unassignedManagers } = data;
  const d = issuer.details ?? {};

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); flash(true, ok); reload(); }
    catch (e: any) { flash(false, e.message); }
    finally { setBusy(false); }
  };

  const addSpvManager = () => run(async () => {
    if (!sm.name.trim()) throw new Error("Name is required.");
    await api.addSpvManager(issuerId, sm);
    setSm({ name: "", company: "", contactEmail: "", phone: "" });
    setAdding(false);
  }, "SPV manager added");

  const addUnder = (smId: string) => {
    const name = prompt("Property manager name?");
    if (!name?.trim()) return;
    run(() => api.addPropertyManagerUnder(smId, { name, contactEmail: prompt("Contact email? (optional)") || null }),
      "Property manager created");
  };

  return (
    <div>
      <div className="card-h" style={{ paddingLeft: 0 }}><span className="ci"><Icon name="building" size={16} /></span><h3>Identity</h3><Pill>{issuer.kybStatus}</Pill></div>
      <div className="row2">
        <Row k="SPV ID" v={issuer.spvId ?? "—"} />
        <Row k="SPV type" v={issuer.spvType ?? issuer.legalEntity ?? "—"} />
      </div>
      <div className="row2">
        <Row k="Jurisdiction" v={d.jurisdiction ?? "—"} />
        <Row k="Registration / CIN" v={d.registrationNumber ?? "—"} />
      </div>
      <div className="row2">
        <Row k="Contact" v={issuer.contactEmail ?? "—"} />
        <Row k="Owner wallet" v={issuer.ownerWallet ? short(issuer.ownerWallet) : "—"} />
      </div>
      {issuer.kybNote && <div className="banner info" style={{ marginTop: 10 }}><Icon name="shield" size={14} />KYB note: {issuer.kybNote}</div>}

      <div className="card-h" style={{ paddingLeft: 0, marginTop: 18 }}><span className="ci"><Icon name="list" size={16} /></span><h3>Assets</h3><span className="hint">{assets.length}</span></div>
      {assets.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Property</th><th>Token</th><th>Status</th></tr></thead>
          <tbody>{assets.map((a) => (
            <tr key={a.id}><td><div className="strong">{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{a.location ?? "—"}</div></td>
              <td className="mono">{a.tokenSymbol ?? "—"}</td><td><Pill>{a.status}</Pill></td></tr>
          ))}</tbody>
        </table></div>
      ) : <div className="muted" style={{ fontSize: 13 }}>No assets deployed for this SPV yet.</div>}

      <div className="card-h" style={{ paddingLeft: 0, marginTop: 18 }}>
        <span className="ci"><Icon name="users" size={16} /></span><h3>SPV managers</h3>
        <span className="hint">oversee this SPV's property managers</span>
        <div style={{ marginLeft: "auto" }}><Btn sm kind="ghost" disabled={busy} onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add"}</Btn></div>
      </div>

      {adding && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div className="row2">
            <Field label="Name"><input value={sm.name} onChange={(e) => setSm({ ...sm, name: e.target.value })} placeholder="Priya Nair" /></Field>
            <Field label="Company"><input value={sm.company} onChange={(e) => setSm({ ...sm, company: e.target.value })} placeholder="Bandra Asset Ops" /></Field>
          </div>
          <div className="row2">
            <Field label="Contact email"><input value={sm.contactEmail} onChange={(e) => setSm({ ...sm, contactEmail: e.target.value })} placeholder="priya@example.com" /></Field>
            <Field label="Phone"><input value={sm.phone} onChange={(e) => setSm({ ...sm, phone: e.target.value })} placeholder="+91…" /></Field>
          </div>
          <Btn disabled={busy} onClick={addSpvManager}>{busy ? "Adding…" : "Add SPV manager"}</Btn>
        </div>
      )}

      {spvManagers.length ? spvManagers.map((s) => (
        <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="strong">{s.name}</div>
            <Pill tone={s.status === "active" ? "green" : undefined}>{s.status}</Pill>
            <span className="muted" style={{ fontSize: 12 }}>{s.company ?? "—"} · {s.contactEmail ?? "no email"}</span>
            <div style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              <Btn sm kind="ghost" disabled={busy} onClick={() => addUnder(s.id)}>+ Property manager</Btn>{" "}
              <Btn sm kind="ghost" disabled={busy}
                onClick={() => run(() => api.updateSpvManager(s.id, { status: s.status === "active" ? "suspended" : "active" }),
                  s.status === "active" ? "SPV manager suspended" : "SPV manager reactivated")}>
                {s.status === "active" ? "Suspend" : "Reactivate"}
              </Btn>
            </div>
          </div>
          <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
            {s.managers.length ? s.managers.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <Icon name="users" size={13} />
                <span>{m.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{m.company ?? "—"}</span>
                <Pill>{m.status}</Pill>
                <div style={{ marginLeft: "auto" }}>
                  <Btn sm kind="ghost" disabled={busy}
                    onClick={() => run(() => api.assignPropertyManager(s.id, m.id, false), `${m.name} detached`)}>Detach</Btn>
                </div>
              </div>
            )) : <div className="muted" style={{ fontSize: 12 }}>No property managers reporting to this SPV manager yet.</div>}
          </div>
        </div>
      )) : <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>No SPV managers yet. Add one to delegate property-manager oversight for this SPV.</div>}

      {unassignedManagers.length > 0 && (
        <>
          <div className="card-h" style={{ paddingLeft: 0, marginTop: 8 }}><span className="ci"><Icon name="users" size={16} /></span><h3>Unassigned property managers</h3></div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Operating this SPV's assets but not reporting to an SPV manager.
          </div>
          {unassignedManagers.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <span>{m.name}</span><span className="muted" style={{ fontSize: 12 }}>{m.company ?? "—"}</span>
              <div style={{ marginLeft: "auto" }}>
                {spvManagers.filter((s) => s.status === "active").map((s) => (
                  <Btn key={s.id} sm kind="ghost" disabled={busy}
                    onClick={() => run(() => api.assignPropertyManager(s.id, m.id, true), `${m.name} → ${s.name}`)}>
                    → {s.name}
                  </Btn>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const KYB_STEPS = ["Entity", "Ownership", "Representative", "Documents", "Review"];
// Mirrors SPV_TYPES in the backend's issuers.service — the server validates against
// its own copy, so a drift here is rejected rather than silently stored.
const SPV_TYPES = ["Private Limited", "Public Limited", "LLP", "Trust", "Fund", "REIT", "Partnership", "Other"];
const REQUIRED_DOCS = ["Certificate of Incorporation", "Constitution (MOA/AOA)", "Board resolution", "Proof of registered address", "UBO declaration"];

/** Step rail. Defaults to the KYB steps; pass `labels` for any other wizard. */
function Stepper({ step, labels = KYB_STEPS }: { step: number; labels?: string[] }) {
  return (
    <div className="steps">
      {labels.map((s, i) => (
        <Fragment key={s}>
          <div className={`step ${i < step ? "done" : i === step ? "active" : ""}`}>
            <span className="num">{i < step ? "✓" : i + 1}</span><span className="lbl">{s}</span>
          </div>
          {i < labels.length - 1 && <span className="line" />}
        </Fragment>
      ))}
    </div>
  );
}

function IssuerWizard({ flash, done }: { flash: Flash; done: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<any>({
    name: "", spvId: "", entityType: "Private Limited", jurisdiction: "India", registrationNumber: "", incorporationDate: "",
    ownerWallet: "", ubos: [{ name: "", pct: "" }],
    repName: "", repDesignation: "", repEmail: "", repPhone: "",
    documents: REQUIRED_DOCS.map((t) => ({ type: t, filename: "" })),
    declaration: false,
  });
  const set = (k: string, v: any) => setD((s: any) => ({ ...s, [k]: v }));
  const setUbo = (idx: number, k: string, v: string) => setD((s: any) => ({ ...s, ubos: s.ubos.map((u: any, i: number) => i === idx ? { ...u, [k]: v } : u) }));
  const setDoc = (idx: number, filename: string) => setD((s: any) => ({ ...s, documents: s.documents.map((doc: any, i: number) => i === idx ? { ...doc, filename } : doc) }));

  const valid = [
    () => d.name.trim() && d.spvId.trim() && d.registrationNumber.trim() && d.incorporationDate,
    () => /^0x[a-fA-F0-9]{40}$/.test(d.ownerWallet) && d.ubos.some((u: any) => u.name.trim()),
    () => d.repName.trim() && /\S+@\S+/.test(d.repEmail),
    () => d.documents.every((doc: any) => doc.filename),
    () => d.declaration,
  ];
  const next = () => { if (!valid[step]()) { flash(false, "Please complete the required fields on this step."); return; } setStep((s) => s + 1); };

  const submit = async () => {
    setBusy(true);
    try {
      await api.registerIssuer({
        name: d.name, legalEntity: d.entityType, contactEmail: d.repEmail, ownerWallet: d.ownerWallet,
        spvId: d.spvId, spvType: d.entityType,
        details: {
          entityType: d.entityType, jurisdiction: d.jurisdiction, registrationNumber: d.registrationNumber, incorporationDate: d.incorporationDate,
          beneficialOwners: d.ubos.filter((u: any) => u.name.trim()),
          representative: { name: d.repName, designation: d.repDesignation, email: d.repEmail, phone: d.repPhone },
          documents: d.documents,
        },
      });
      flash(true, `${d.name} submitted for KYB review`); done();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <Stepper step={step} />
      {step === 0 && (
        <div>
          <Field label="Legal entity name"><input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Bandra Realty SPV LLP" /></Field>
          <div className="row2">
            <Field label="SPV ID"><input value={d.spvId} onChange={(e) => set("spvId", e.target.value)} placeholder="SPV-BAN-001" /></Field>
            <Field label="SPV type"><select value={d.entityType} onChange={(e) => set("entityType", e.target.value)}>{SPV_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
            The SPV ID is your unique reference for this vehicle — separate from its CIN below. It must not already be in use.
          </div>
          <Field label="Jurisdiction"><input value={d.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} placeholder="India" /></Field>
          <div className="row2">
            <Field label="Registration / CIN no."><input value={d.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="U70200MH2024PTC000000" /></Field>
            <Field label="Date of incorporation"><input type="date" value={d.incorporationDate} onChange={(e) => set("incorporationDate", e.target.value)} /></Field>
          </div>
        </div>
      )}
      {step === 1 && (
        <div>
          <Field label="Token owner wallet (SPV multisig in production)"><input value={d.ownerWallet} onChange={(e) => set("ownerWallet", e.target.value)} placeholder="0x…" /></Field>
          <label style={{ fontSize: 12, color: "var(--text-2)", display: "block", marginBottom: 8 }}>Beneficial owners (UBOs)</label>
          {d.ubos.map((u: any, i: number) => (
            <div className="uborow" key={i}>
              <input placeholder="Full name" value={u.name} onChange={(e) => setUbo(i, "name", e.target.value)} className="input" />
              <input placeholder="% own" value={u.pct} onChange={(e) => setUbo(i, "pct", e.target.value)} className="input" />
              <Btn sm kind="ghost" type="button" onClick={() => setD((s: any) => ({ ...s, ubos: s.ubos.filter((_: any, idx: number) => idx !== i) }))}><Icon name="x" size={13} /></Btn>
            </div>
          ))}
          <Btn sm kind="subtle" type="button" onClick={() => setD((s: any) => ({ ...s, ubos: [...s.ubos, { name: "", pct: "" }] }))}><Icon name="plus" size={13} />Add owner</Btn>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="row2">
            <Field label="Representative name"><input value={d.repName} onChange={(e) => set("repName", e.target.value)} placeholder="Asha Patel" /></Field>
            <Field label="Designation"><input value={d.repDesignation} onChange={(e) => set("repDesignation", e.target.value)} placeholder="Director" /></Field>
          </div>
          <div className="row2">
            <Field label="Email"><input value={d.repEmail} onChange={(e) => set("repEmail", e.target.value)} placeholder="asha@spv.com" /></Field>
            <Field label="Phone"><input value={d.repPhone} onChange={(e) => set("repPhone", e.target.value)} placeholder="+91 …" /></Field>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="banner info"><Icon name="list" size={14} />Attach each required document (filename is recorded — demo, no upload).</div>
          {d.documents.map((doc: any, i: number) => (
            <div className="docrow" key={doc.type}>
              <span className="dn">{doc.type}{doc.filename ? <span className="muted"> · {doc.filename}</span> : null}</span>
              {doc.filename ? <Pill tone="green">attached</Pill> : <Pill tone="gray">missing</Pill>}
              <label className="btn ghost sm" style={{ cursor: "pointer" }}>Attach<input type="file" style={{ display: "none" }} onChange={(e) => setDoc(i, e.target.files?.[0]?.name || "")} /></label>
            </div>
          ))}
        </div>
      )}
      {step === 4 && (
        <div>
          <div className="review-grid">
            <div className="rv"><div className="k">Entity</div><div className="v">{d.name}</div></div>
            <div className="rv"><div className="k">Type · jurisdiction</div><div className="v">{d.entityType} · {d.jurisdiction}</div></div>
            <div className="rv"><div className="k">Registration</div><div className="v">{d.registrationNumber}</div></div>
            <div className="rv"><div className="k">Incorporated</div><div className="v">{d.incorporationDate}</div></div>
            <div className="rv"><div className="k">Owner wallet</div><div className="v mono">{short(d.ownerWallet)}</div></div>
            <div className="rv"><div className="k">Representative</div><div className="v">{d.repName} · {d.repEmail}</div></div>
            <div className="rv"><div className="k">Beneficial owners</div><div className="v">{d.ubos.filter((u: any) => u.name).map((u: any) => `${u.name}${u.pct ? ` (${u.pct}%)` : ""}`).join(", ") || "—"}</div></div>
            <div className="rv"><div className="k">Documents</div><div className="v">{d.documents.filter((x: any) => x.filename).length}/{d.documents.length} attached</div></div>
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 16, fontSize: 13 }}>
            <input type="checkbox" checked={d.declaration} onChange={(e) => set("declaration", e.target.checked)} />
            I confirm the information provided is accurate and complete.
          </label>
        </div>
      )}
      <div className="wizard-nav">
        <Btn kind="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>Back</Btn>
        {step < 4 ? <Btn onClick={next}>Continue</Btn> : <Btn disabled={busy || !d.declaration} onClick={submit}>{busy ? "Submitting…" : "Submit for KYB review"}</Btn>}
      </div>
    </div>
  );
}

function IssuerReview({ issuer, flash, done }: { issuer: Issuer; flash: Flash; done: () => void }) {
  const d = issuer.details ?? {};
  const editable = issuer.kyb_status === "pending_review";
  const isPublicApplication = d.source === "public-application";

  // Editable KYB state, pre-filled from whatever the issuer already has. Public
  // applications arrive with only name/email/property notes — the operator fills
  // the rest here before approving.
  const rep = d.representative ?? {};
  const [f, setF] = useState<any>({
    entityType: d.entityType ?? issuer.legal_entity ?? "Private Limited",
    jurisdiction: d.jurisdiction ?? "India",
    registrationNumber: d.registrationNumber ?? "",
    incorporationDate: d.incorporationDate ?? "",
    repName: rep.name ?? "",
    repDesignation: rep.designation ?? "",
    repEmail: rep.email ?? issuer.contact_email ?? "",
    repPhone: rep.phone ?? "",
  });
  const [ubos, setUbos] = useState<any[]>(
    (d.beneficialOwners ?? []).length ? d.beneficialOwners : [{ name: "", pct: "" }]
  );
  const [documents, setDocuments] = useState<any[]>(
    REQUIRED_DOCS.map((t) => ({ type: t, filename: (d.documents ?? []).find((x: any) => x.type === t)?.filename ?? "" }))
  );
  const [ownerWallet, setOwnerWallet] = useState(issuer.owner_wallet ?? "");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s: any) => ({ ...s, [k]: v }));
  const setUbo = (i: number, k: string, v: string) => setUbos((s) => s.map((u, idx) => (idx === i ? { ...u, [k]: v } : u)));
  const setDoc = (i: number, filename: string) => setDocuments((s) => s.map((doc, idx) => (idx === i ? { ...doc, filename } : doc)));

  const buildDetails = () => ({
    ...d, // preserve enquiry fields (propertyName, location, source, …)
    entityType: f.entityType, jurisdiction: f.jurisdiction,
    registrationNumber: f.registrationNumber, incorporationDate: f.incorporationDate,
    beneficialOwners: ubos.filter((u) => u.name.trim()),
    representative: { name: f.repName, designation: f.repDesignation, email: f.repEmail, phone: f.repPhone },
    documents,
  });

  // Persist the edited KYB details; optionally approve in the same click.
  const save = async (approveAfter: boolean) => {
    const wallet = ownerWallet.trim();
    if (approveAfter && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) { flash(false, "Enter a valid token owner wallet before approving."); return; }
    setBusy(true);
    try {
      await api.updateIssuer(issuer.id, {
        legalEntity: f.entityType,
        contactEmail: f.repEmail || undefined,
        ownerWallet: wallet || undefined,
        details: buildDetails(),
      });
      if (approveAfter) { await api.approveKyb(issuer.id, wallet); flash(true, "KYB details saved & approved"); }
      else flash(true, "KYB details saved");
      done();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };

  const reject = async () => {
    setBusy(true);
    try { await api.rejectKyb(issuer.id, prompt("Rejection reason?") || "KYB requirements not met"); flash(true, "KYB rejected"); done(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };

  // Read-only view for already-decided issuers (approved / rejected).
  if (!editable) {
    return (
      <div>
        <div className="review-grid">
          <Row k="Legal entity" v={issuer.name} />
          <Row k="Type · jurisdiction" v={`${d.entityType ?? issuer.legal_entity ?? "—"} · ${d.jurisdiction ?? "—"}`} />
          <Row k="Registration" v={d.registrationNumber} />
          <Row k="Incorporated" v={d.incorporationDate} />
          <Row k="Owner wallet" v={<span className="mono">{short(issuer.owner_wallet)}</span>} />
          <Row k="Representative" v={d.representative ? `${d.representative.name} · ${d.representative.email}` : issuer.contact_email} />
          <Row k="Beneficial owners" v={(d.beneficialOwners ?? []).map((u: any) => `${u.name}${u.pct ? ` (${u.pct}%)` : ""}`).join(", ")} />
        </div>
        <div className="section-label">Documents</div>
        <div>{(d.documents ?? []).map((doc: any) => (
          <div className="docrow" key={doc.type}><span className="dn">{doc.type}</span>{doc.filename ? <><span className="mono muted">{doc.filename}</span><Pill tone="green">attached</Pill></> : <Pill tone="gray">missing</Pill>}</div>
        ))}{(!d.documents || !d.documents.length) && <div className="muted" style={{ fontSize: 13 }}>No documents on file.</div>}</div>
        {issuer.kyb_status === "rejected" && <div className="banner err" style={{ marginTop: 14 }}>Rejected{issuer.kyb_note ? `: ${issuer.kyb_note}` : ""}</div>}
      </div>
    );
  }

  // Editable KYB capture for pending issuers.
  return (
    <div>
      {isPublicApplication && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          <Icon name="list" size={14} />Public application{d.propertyName ? ` · ${d.propertyName}` : ""}{d.location ? `, ${d.location}` : ""}. Complete the KYB details below before approving.
        </div>
      )}
      {d.image && <img src={d.image} alt="Submitted property" style={{ width: "100%", maxWidth: 320, aspectRatio: "16/10", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 14 }} />}

      <div className="section-label">Entity</div>
      <Field label="Legal entity name"><input value={issuer.name} disabled /></Field>
      <div className="row2">
        <Field label="Entity type"><select value={f.entityType} onChange={(e) => set("entityType", e.target.value)}>{["Private Limited", "LLP", "Trust", "Fund", "Public Limited", "Other"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Jurisdiction"><input value={f.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} placeholder="India" /></Field>
      </div>
      <div className="row2">
        <Field label="Registration / CIN no."><input value={f.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="U70200MH2024PTC000000" /></Field>
        <Field label="Date of incorporation"><input type="date" value={f.incorporationDate} onChange={(e) => set("incorporationDate", e.target.value)} /></Field>
      </div>

      <div className="section-label" style={{ marginTop: 14 }}>Authorized representative</div>
      <div className="row2">
        <Field label="Name"><input value={f.repName} onChange={(e) => set("repName", e.target.value)} placeholder="Asha Patel" /></Field>
        <Field label="Designation"><input value={f.repDesignation} onChange={(e) => set("repDesignation", e.target.value)} placeholder="Director" /></Field>
      </div>
      <div className="row2">
        <Field label="Email"><input value={f.repEmail} onChange={(e) => set("repEmail", e.target.value)} placeholder="asha@spv.com" /></Field>
        <Field label="Phone"><input value={f.repPhone} onChange={(e) => set("repPhone", e.target.value)} placeholder="+91 …" /></Field>
      </div>

      <div className="section-label" style={{ marginTop: 14 }}>Beneficial owners (UBOs)</div>
      {ubos.map((u, i) => (
        <div className="uborow" key={i}>
          <input placeholder="Full name" value={u.name} onChange={(e) => setUbo(i, "name", e.target.value)} className="input" />
          <input placeholder="% own" value={u.pct} onChange={(e) => setUbo(i, "pct", e.target.value)} className="input" />
          <Btn sm kind="ghost" type="button" onClick={() => setUbos((s) => s.filter((_, idx) => idx !== i))}><Icon name="x" size={13} /></Btn>
        </div>
      ))}
      <Btn sm kind="subtle" type="button" onClick={() => setUbos((s) => [...s, { name: "", pct: "" }])}><Icon name="plus" size={13} />Add owner</Btn>

      <div className="section-label" style={{ marginTop: 14 }}>Documents</div>
      {documents.map((doc, i) => (
        <div className="docrow" key={doc.type}>
          <span className="dn">{doc.type}{doc.filename ? <span className="muted"> · {doc.filename}</span> : null}</span>
          {doc.filename ? <Pill tone="green">attached</Pill> : <Pill tone="gray">missing</Pill>}
          <label className="btn ghost sm" style={{ cursor: "pointer" }}>Attach<input type="file" style={{ display: "none" }} onChange={(e) => setDoc(i, e.target.files?.[0]?.name || "")} /></label>
        </div>
      ))}

      <div className="section-label" style={{ marginTop: 14 }}>Token owner wallet</div>
      <Field label="SPV multisig / owner wallet (the token will be owned by this address)">
        <input value={ownerWallet} onChange={(e) => setOwnerWallet(e.target.value)} placeholder="0x…" className="mono" />
      </Field>
      {!issuer.owner_wallet && <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>Public applications don&apos;t include a wallet — set it here so the asset can be deployed after approval.</div>}

      <div className="wizard-nav" style={{ marginTop: 16 }}>
        <Btn kind="ghost" disabled={busy} onClick={reject}>Reject</Btn>
        <Btn kind="subtle" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save details"}</Btn>
        <Btn disabled={busy} onClick={() => save(true)}>{busy ? "Working…" : "Save & approve KYB"}</Btn>
      </div>
    </div>
  );
}
const ASSET_STEPS = ["Add Property", "Documents", "Token", "List Asset"];
const ASSET_DOCS = ["Title Deed", "Valuation Report", "SPV Ownership Proof"];
// Currency symbol for the money labels. The offering stores the code; this is display only.
const CCY: Record<string, string> = { INR: "\u20b9", AED: "AED", USD: "$", EUR: "\u20ac", GBP: "\u00a3", SGD: "S$" };

/**
 * Create-asset wizard. Four steps mirroring how an asset actually comes to market:
 * describe the property, evidence it, define the token, then set listing terms.
 *
 * Almost every field already existed on the offering — this reorganises them and
 * adds only what was genuinely missing (gallery images, documents, a token name
 * distinct from the listing name, and an explicit listing status). Total tokens is
 * DERIVED from raise / price rather than entered twice: the backend enforces the
 * same relationship, so letting them drift here would just produce a 400.
 */
function CreateAsset({ issuerId, flash, done }: { issuerId: string; flash: Flash; done: () => void }) {
  const [step, setStep] = useState(0);
  const [cfg] = useAsync(() => api.config(), [], null as { network: string; chainId: number } | null);
  const [f, setF] = useState<Record<string, string>>({
    // step 1 — property
    name: "", propertyType: "commercial", assetType: "Commercial Real Estate", location: "",
    propertyValue: "", currency: "INR", image: "", gallery: "", occupancyPct: "", description: "",
    // step 3 — token
    // Listing/token amounts are BLANK, not hardcoded — the operator enters each
    // one per asset. maxHolders/lockup keep sensible technical defaults (not part
    // of the priced listing terms).
    tokenName: "", symbol: "", pricePerToken: "", maxHolders: "500", lockupDays: "180",
    // step 4 — listing. targetRaise DERIVES from the property value (below) unless
    // overridden; min/max are per-investor limits.
    listingName: "", targetRaise: "", minInvestment: "", maxInvestment: "",
    yieldPct: "", status: "open", country: "356", visibility: "public",
    requiresAccreditation: "no", accreditedMaxInvestment: "",
    ownerOccupied: "no", sellerWallet: "", retainedPct: "",
  });
  const [docs, setDocs] = useState(ASSET_DOCS.map((t) => ({ type: t, name: "", url: "" })));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const setDoc = (i: number, k: "name" | "url", v: string) =>
    setDocs((s) => s.map((d, j) => (j === i ? { ...d, [k]: v } : d)));

  const accreditedOnly = f.requiresAccreditation === "yes";
  const ownerOccupied = f.ownerOccupied === "yes";
  const sym = CCY[f.currency] ?? f.currency;
  const price = +f.pricePerToken || 0;
  const propertyValue = +f.propertyValue || 0;
  // Total offering defaults to the property value (whole-property raise) unless the
  // operator overrides it — so it always reflects THIS asset, never a stale default.
  const raise = +f.targetRaise || propertyValue;
  // The single source of truth for supply; shown, never typed.
  const totalTokens = price > 0 ? Math.round(raise / price) : 0;
  const gallery = f.gallery.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);

  const valid = [
    () => f.name.trim() && f.location.trim() && +f.propertyValue > 0,
    () => docs.every((d) => d.url.trim()),
    () => f.symbol.trim() && f.tokenName.trim() && price > 0,
    () => raise > 0 && totalTokens > 0,
  ];
  const HINTS = [
    "Property name, location and value are required.",
    "All three documents need a URL before an asset can be listed.",
    "Token name, symbol and a price above zero are required.",
    "Set a total offering and a minimum investment.",
  ];
  const next = () => { if (!valid[step]()) { flash(false, HINTS[step]); return; } setStep((s) => s + 1); };

  // Creation ONLY runs from an explicit click on the Create button (onClick), never
  // from a form submit / Enter — that was creating the asset without a manual click.
  // The form's onSubmit is neutered (advance at most), so Enter can't create.
  const go = async () => {
    if (!valid[3]()) { flash(false, HINTS[3]); return; }
    setBusy(true);
    try {
      await api.createAsset(issuerId, {
        // token
        symbol: f.symbol.trim().toUpperCase(), tokenName: f.tokenName.trim(), totalTokens,
        pricePerToken: price, maxHolders: +f.maxHolders, lockupDays: +f.lockupDays,
        // property
        name: (f.listingName.trim() || f.name.trim()), location: f.location, assetType: f.assetType,
        propertyType: f.propertyType, propertyValue: +f.propertyValue,
        description: f.description.trim() || null,
        image: f.image.trim() || gallery[0] || null, images: gallery,
        documents: docs.map((d) => ({ type: d.type, name: d.name.trim() || null, url: d.url.trim() })),
        occupancyPct: f.occupancyPct.trim() ? +f.occupancyPct : null,
        // listing. Blank min → one token; blank max → no cap.
        currency: f.currency, targetRaise: raise, minInvestment: +f.minInvestment || price,
        maxInvestment: +f.maxInvestment || null, yieldPct: +f.yieldPct || null, country: +f.country,
        status: f.status, visibility: f.visibility,
        requiresAccreditation: accreditedOnly,
        accreditedMaxInvestment: accreditedOnly ? (+f.accreditedMaxInvestment || null) : null,
        ownerOccupied, sellerWallet: ownerOccupied ? f.sellerWallet.trim() || null : null,
        retainedPct: ownerOccupied && f.retainedPct.trim() ? +f.retainedPct : null,
      });
      flash(true, `${f.listingName.trim() || f.name} created — deploy its token from Offerings`);
      done();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };

  const I = (k: string, l: string) => <Field key={k} label={l}><input value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step < ASSET_STEPS.length - 1) next(); }}>
      <Stepper step={step} labels={ASSET_STEPS} />

      {step === 0 && (
        <div>
          <Field label="Property name"><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Marina Crest Residence" /></Field>
          <div className="row2">
            <Field label="Property type"><select value={f.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
              <option value="single_family">Single family</option><option value="multi_family">Multi family / Residential apartment</option>
              <option value="vacation_rental">Vacation rental</option><option value="commercial">Commercial</option><option value="owner_occupied">Owner occupied</option>
            </select></Field>
            {I("assetType", "Asset type (free text)")}
          </div>
          <Field label="Location"><input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Dubai Marina, Dubai, UAE" /></Field>
          <div className="row2">
            <Field label="Currency"><select value={f.currency} onChange={(e) => set("currency", e.target.value)}>{Object.keys(CCY).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label={`Property value (${sym})`}><input value={f.propertyValue} onChange={(e) => set("propertyValue", e.target.value)} placeholder="2500000" /></Field>
          </div>
          <Field label="Primary image URL"><input value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…/marina-crest.jpg" /></Field>
          <Field label="More image URLs (one per line, or comma-separated)">
            <textarea rows={3} value={f.gallery} onChange={(e) => set("gallery", e.target.value)} placeholder={"https://…/lobby.jpg\nhttps://…/pool.jpg"} />
          </Field>
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
            {gallery.length ? `${gallery.length} gallery image${gallery.length === 1 ? "" : "s"}. ` : ""}
            The primary image is the marketplace card; if you leave it blank the first gallery image is used.
          </div>
          <div className="row2">{I("occupancyPct", "Occupancy % (optional)")}{I("description", "Short description (optional)")}</div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="banner info" style={{ marginBottom: 12 }}><Icon name="shield" size={14} />All three are required. Upload the file elsewhere and paste its URL — these are recorded against the asset and shown in the offering record.</div>
          {docs.map((d, i) => (
            <div key={d.type} className="row2">
              <Field label={d.type}><input value={d.url} onChange={(e) => setDoc(i, "url", e.target.value)} placeholder="https://…/title-deed.pdf" /></Field>
              <Field label="Reference / note (optional)"><input value={d.name} onChange={(e) => setDoc(i, "name", e.target.value)} placeholder="Deed no. 1234/2024" /></Field>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 12 }}>
            {docs.filter((d) => d.url.trim()).length} of {docs.length} provided.
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="row2">
            <Field label="Token name"><input value={f.tokenName} onChange={(e) => set("tokenName", e.target.value)} placeholder="Marina Crest Real Estate Token" /></Field>
            <Field label="Symbol"><input value={f.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="MCRRE" /></Field>
          </div>
          <div className="row2">
            <Field label={`Token price (${sym})`}><input value={f.pricePerToken} onChange={(e) => set("pricePerToken", e.target.value)} placeholder="e.g. 1000" /></Field>
            <Field label="Total tokens (from raise ÷ price)"><input value={totalTokens ? totalTokens.toLocaleString() : "—"} readOnly /></Field>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
            Supply is derived from the total offering on the next step, so the two can never disagree. Change the price or the raise to change it.
          </div>
          <Field label="Blockchain"><input readOnly value={cfg ? `${cfg.network} (chain ${cfg.chainId})` : "loading…"} /></Field>
          <div className="row2">{I("maxHolders", "Max holders")}{I("lockupDays", "Lockup (days)")}</div>
        </div>
      )}

      {step === 3 && (
        <div>
          <Field label="Listing name"><input value={f.listingName} onChange={(e) => set("listingName", e.target.value)} placeholder={f.name || "Marina Crest Residence"} /></Field>
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>Leave blank to use the property name.</div>
          <div className="row2">
            <Field label={`Total offering (${sym})`}><input value={f.targetRaise} onChange={(e) => set("targetRaise", e.target.value)} placeholder={propertyValue ? String(propertyValue) : "property value"} /></Field>
            <Field label={`Minimum investment (${sym})`}><input value={f.minInvestment} onChange={(e) => set("minInvestment", e.target.value)} placeholder={price ? String(price) : "e.g. one token"} /></Field>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
            Total offering defaults to the property value ({sym} {propertyValue.toLocaleString()}). Override it for a partial raise.
          </div>
          <div className="row2">
            <Field label="Expected rental yield %"><input value={f.yieldPct} onChange={(e) => set("yieldPct", e.target.value)} placeholder="e.g. 8.5" /></Field>
            <Field label="Status once deployed"><select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="open">Live — open for investment</option>
              <option value="coming_soon">Coming soon — visible, not yet investable</option>
            </select></Field>
          </div>
          <div className="row2">{I("maxInvestment", accreditedOnly ? "Max / retail investor" : "Max / investor")}{I("country", "Country code (ISO numeric)")}</div>
          <Field label="Investor eligibility"><select value={f.requiresAccreditation} onChange={(e) => set("requiresAccreditation", e.target.value)}><option value="no">Any KYC-verified investor</option><option value="yes">Accredited investors only (requires on-chain ACCREDITED claim)</option></select></Field>
          {accreditedOnly && <>{I("accreditedMaxInvestment", "Max / accredited investor")}<div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>Deploys requiring both KYC + ACCREDITED claims on-chain.</div></>}
          <Field label="Listing visibility"><select value={f.visibility} onChange={(e) => set("visibility", e.target.value)}><option value="public">Public — listed on the marketplace</option><option value="private">Private placement — eligible investors only</option></select></Field>
          <Field label="Owner-occupied (seller keeps equity)"><select value={f.ownerOccupied} onChange={(e) => set("ownerOccupied", e.target.value)}><option value="no">No — full sale</option><option value="yes">Yes — seller retains a share and keeps earning rent</option></select></Field>
          {ownerOccupied && <div className="row2">{I("sellerWallet", "Seller wallet")}{I("retainedPct", "Retained equity %")}</div>}
          <div className="banner info" style={{ margin: "12px 0" }}><Icon name="building" size={14} />
            Creates the listing only — nothing is deployed on-chain yet. It appears in <b style={{ margin: "0 4px" }}>Offerings</b> as
            <b style={{ margin: "0 4px" }}>coming soon</b>; hit <b style={{ margin: "0 4px" }}>Deploy token</b> there to mint
            {" "}<b>{totalTokens.toLocaleString()}</b> {f.symbol.toUpperCase() || "tokens"} at {sym} {price.toLocaleString()} = {sym} {raise.toLocaleString()}
            {f.status === "open" ? ", which then goes live automatically." : "."}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {step > 0 && <Btn kind="ghost" type="button" disabled={busy} onClick={() => setStep((s) => s - 1)}>Back</Btn>}
        <div style={{ marginLeft: "auto" }}>
          {step < 3
            ? <Btn type="button" onClick={next}>Continue</Btn>
            : <Btn type="button" disabled={busy} onClick={go}>{busy ? "Creating…" : "Create asset"}</Btn>}
        </div>
      </div>
    </form>
  );
}

/* ============ Investors ============ */
const amlTone = (s?: string) => s === "clear" ? "green" : s === "review" ? "amber" : s === "blocked" ? "red" : "gray";
const fmtWhen = (t?: string | null) => t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
// ISO 3166-1 numeric → name, for the codes actually used here. Falls back to the code.
const COUNTRY: Record<number, string> = { 356: "India", 840: "United States", 784: "UAE", 826: "United Kingdom", 702: "Singapore", 36: "Australia", 124: "Canada" };
const countryName = (c?: number | null) => (c == null ? "—" : COUNTRY[c] ?? `#${c}`);
const money2 = (ccy: string | null, n: number) => `${ccy ?? ""} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
// A privileged action → a human-readable timeline label.
const TIMELINE_LABEL: Record<string, string> = {
  "kyc.submit": "Submitted KYC", "kyc.reject": "KYC rejected", "kyc.approve": "KYC approved",
  "wallet.link": "Linked a wallet", "account.wallet.attach": "Attached wallet to account",
  "investor.onboard": "Onboarded on-chain", "order.pay-crypto": "Paid (crypto)",
  "buyback.sell": "Sold back to seller", "governance.vote": "Voted on a proposal",
};

/* ============ Investor details ============ */
/**
 * Full per-PERSON investor view: personal, KYC (+ timeline), on-chain identity and
 * every linked wallet, holdings, and estimated earnings. Read-only — the register's
 * row actions stay on the list; this is the "who is this" panel.
 */
function InvestorDetails({ wallet }: { wallet: string }) {
  const [d, loading, error] = useAsync(() => api.investorDetail(wallet), [wallet], null as InvestorDetail | null);
  if (loading) return <Loading />;
  if (error) return <LoadError error={error} retry={() => location.reload()} />;
  if (!d) return null;
  const held = d.holdings.filter((h) => h.balance > 0);

  return (
    <div>
      {/* 1 · personal */}
      <div className="card-h" style={{ paddingLeft: 0 }}><span className="ci"><Icon name="users" size={16} /></span><h3>{d.person.name ?? "—"}</h3>
        {d.person.hasAccount && <Pill tone="cyan">has account</Pill>}</div>
      <div className="row2"><Row k="Email" v={d.person.email} /><Row k="Country" v={countryName(d.person.country)} /></div>
      <Row k="First seen" v={fmtWhen(d.person.createdAt)} />

      {/* 2 · KYC */}
      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="shield" size={16} /></span><h3>KYC & compliance</h3></div>
      <div className="row2">
        <Row k="Compliance" v={d.kyc.complianceApproved ? <Pill tone="green">approved</Pill> : <Pill>{d.kyc.status}</Pill>} />
        <Row k="On-chain" v={d.kyc.onchainVerified ? <Pill tone="green">verified</Pill> : <Pill tone="gray">not registered</Pill>} />
      </div>
      <div className="row2">
        <Row k="AML" v={<Pill tone={amlTone(d.kyc.amlStatus)}>{d.kyc.amlStatus}</Pill>} />
        <Row k="Accreditation" v={<Pill tone={d.kyc.accreditationStatus === "accredited" ? "cyan" : "gray"}>{d.kyc.accreditationStatus}</Pill>} />
      </div>
      <div className="row2"><Row k="Doc type" v={d.kyc.docType} /><Row k="Address doc" v={d.kyc.addressDocType} /></div>
      {d.kyc.note && <Row k="Note" v={d.kyc.note} />}
      <div style={{ fontSize: 12, marginTop: 4 }} className="muted">
        Verified per asset: {Object.entries(d.kyc.verifiedFor).filter(([, v]) => v).map(([s]) => s).join(", ") || "none yet"}
      </div>

      {/* 3 · identity + wallets */}
      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="gear" size={16} /></span><h3>On-chain identity</h3></div>
      <Row k="ONCHAINID" v={d.identity.onchainid ? <ExplorerAddr addr={d.identity.onchainid} /> : "—"} />
      <div style={{ marginTop: 6 }}>
        {d.identity.wallets.map((w) => (
          <div key={w.address} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <ExplorerAddr addr={w.address} />
            {w.primary && <Pill tone="cyan">primary</Pill>}
            {w.amlScreening && <Pill tone={amlTone(w.amlScreening)}>{w.amlScreening}</Pill>}
            {w.linkedAt && <span className="muted" style={{ fontSize: 12 }}>linked {fmtWhen(w.linkedAt)}</span>}
          </div>
        ))}
      </div>

      {/* 4 · holdings */}
      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="table" size={16} /></span><h3>Holdings</h3><span className="hint">{held.length}</span></div>
      {held.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Asset</th><th>Tokens</th><th>NAV/token</th><th>Value</th><th>Yield</th><th>Est. annual</th></tr></thead>
          <tbody>{held.map((h) => (
            <tr key={h.symbol}><td><Pill tone="cyan">{h.symbol}</Pill>{h.frozen && <Pill tone="red">frozen</Pill>}</td>
              <td>{h.balance.toLocaleString()}</td><td>{money2(h.currency, h.navPerToken)}</td>
              <td className="strong">{money2(h.currency, h.value)}</td><td>{h.yieldPct}%</td>
              <td>{money2(h.currency, h.projectedAnnual)}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <div className="muted" style={{ fontSize: 13 }}>No token holdings.</div>}

      {/* 5 · earnings */}
      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="check" size={16} /></span><h3>Estimated earnings</h3></div>
      {d.earnings.length ? d.earnings.map((e) => (
        <div key={e.currency} className="row2">
          <Row k={`Claimed / claimable (${e.currency})`} v={`${money2(e.currency, e.claimed)}  ·  ${money2(e.currency, e.claimable)} due`} />
          <Row k={`Projected annual (${e.currency})`} v={money2(e.currency, e.projectedAnnual)} />
        </div>
      )) : <div className="muted" style={{ fontSize: 13 }}>No earnings yet.</div>}
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Projection = current holdings × NAV × target yield. Not a guarantee.</div>

      {/* timeline */}
      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="list" size={16} /></span><h3>Activity timeline</h3><span className="hint">{d.timeline.length}</span></div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {d.timeline.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="muted mono" style={{ fontSize: 11, minWidth: 96 }}>{fmtWhen(t.when)}</span>
            <span style={{ fontSize: 13 }}>{TIMELINE_LABEL[t.action] ?? t.action}</span>
            {t.status && t.status !== "success" && <Pill tone="red">{t.status}</Pill>}
          </div>
        ))}
        {d.timeline.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No recorded activity.</div>}
      </div>
    </div>
  );
}
function Investors({ flash, refresh, rk, tokens }: { flash: Flash; refresh: () => void; rk: number; tokens: TokenInfo[] }) {
  const [investors, loading, error] = useAsync(() => api.investors(), [rk], [] as Investor[]);
  const [pendingKyc] = useAsync(() => api.pendingKyc(), [rk], [] as Investor[]);
  const [modal, setModal] = useState(false);
  const [reviewing, setReviewing] = useState<Investor | null>(null);
  const [detailWallet, setDetailWallet] = useState<string | null>(null);
  // Categorise + search so the register scales past a page of rows.
  const [q, setQ] = useState("");
  const [kycF, setKycF] = useState("all");
  const [amlF, setAmlF] = useState("all");
  const filtered = investors.filter((i) => {
    const needle = q.trim().toLowerCase();
    if (needle && !`${i.name ?? ""} ${i.email ?? ""} ${i.wallet}`.toLowerCase().includes(needle)) return false;
    if (kycF === "verified" && !i.verified) return false;
    if (kycF !== "all" && kycF !== "verified" && i.kyc_status !== kycF) return false;
    if (amlF !== "all" && (i.aml_status ?? "unscreened") !== amlF) return false;
    return true;
  });
  const pg = usePaged(filtered, 12);
  const revoke = async (w: string) => { if (!confirm("Revoke KYC across all assets?")) return; try { await api.revokeClaim(w); flash(true, `Revoked ${short(w)}`); refresh(); } catch (e: any) { flash(false, e.message); } };
  const decideAcc = async (w: string, ok: boolean) => { try { const r = ok ? await api.approveAccreditation(w) : await api.rejectAccreditation(w, prompt("Reason?") || "Not accredited"); flash(true, `Accreditation ${ok ? "granted" : "revoked"} · ${r.onchain}`); refresh(); } catch (e: any) { flash(false, e.message); } };

  // Detail is a sub-view of Investors, not a modal: selecting a row swaps the
  // register for that investor's full profile, with a link back to the list.
  const selected = detailWallet ? investors.find((i) => i.wallet === detailWallet) : null;
  if (detailWallet) {
    return (
      <>
        <PageHead
          title={selected?.name || "Investor details"}
          sub={selected?.email || short(detailWallet)}
          actions={<Btn kind="ghost" onClick={() => setDetailWallet(null)}>← Back to investors</Btn>}
        />
        <Card><InvestorDetails wallet={detailWallet} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHead title="Investors" sub="KYC review queue and the investor register" actions={<Btn onClick={() => setModal(true)}><Icon name="plus" size={15} />Onboard</Btn>} />
      {pendingKyc.length > 0 && (
        <><div className="section-label">KYC review queue · {pendingKyc.length}</div>
          <Card pad={false}><div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Investor</th><th>Wallet</th><th>Country</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
            <tbody>{pendingKyc.map((i) => (
              <tr key={i.wallet}><td className="strong">{i.name ?? "—"}<div className="muted" style={{ fontSize: 12 }}>{i.email ?? "—"}</div></td><td className="mono">{short(i.wallet)}</td><td className="muted">{i.country ?? "—"}</td>
                <td className="muted">{fmtWhen(i.kyc_submitted_at)}</td>
                <td><Pill tone={i.kyc_status === "verifying" ? "cyan" : undefined}>{i.kyc_status}</Pill></td>
                <td style={{ textAlign: "right" }}><Btn sm onClick={() => setReviewing(i)}>Review</Btn></td></tr>
            ))}</tbody>
          </table></div></Card>
        </>
      )}
      <div className="section-label">All investors · {filtered.length}{filtered.length !== investors.length ? ` of ${investors.length}` : ""}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input className="input" placeholder="Search name, email, or wallet…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 240px", minWidth: 180 }} />
        <select className="input" value={kycF} onChange={(e) => setKycF(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="all">KYC: all</option><option value="verified">On-chain verified</option>
          <option value="completed">Approved (completed)</option><option value="applied">Applied</option>
          <option value="verifying">Verifying</option><option value="rejected">Rejected</option>
        </select>
        <select className="input" value={amlF} onChange={(e) => setAmlF(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="all">AML: all</option><option value="clear">Clear</option>
          <option value="review">Review</option><option value="blocked">Blocked</option><option value="unscreened">Unscreened</option>
        </select>
      </div>
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : filtered.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Investor</th><th>Country</th><th>Wallet</th><th>KYC</th><th>AML</th><th>Accreditation</th><th></th></tr></thead>
            <tbody>{pg.slice.map((i) => (
              <tr key={i.wallet}><td className="strong">{i.name ?? "—"}<div className="muted" style={{ fontSize: 12 }}>{i.email ?? "—"}</div></td>
                <td className="muted">{countryName(i.country)}</td>
                <td className="mono">{short(i.wallet)}</td>
                <td>{i.verified
                  ? <Pill tone="green">verified</Pill>
                  : i.kyc_status === "completed"
                    ? <Pill tone="cyan">approved</Pill>
                    : <Pill>{i.kyc_status}</Pill>}</td>
                <td><Pill tone={amlTone(i.aml_status)}>{i.aml_status ?? "unscreened"}</Pill></td>
                <td>{i.accreditation_status === "accredited" ? <Pill tone="cyan">accredited</Pill> : <Pill>{i.accreditation_status ?? "none"}</Pill>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", gap: 7 }}>
                  <Btn sm kind="ghost" onClick={() => setDetailWallet(i.wallet)}>View details</Btn>
                  {i.accreditation_status === "accredited"
                    ? <Btn sm kind="ghost" onClick={() => decideAcc(i.wallet, false)}>Revoke accred.</Btn>
                    : <Btn sm onClick={() => decideAcc(i.wallet, true)} disabled={i.kyc_status !== "completed"}>Grant accred.</Btn>}
                  <Btn sm kind="ghost" onClick={() => revoke(i.wallet)}>Revoke KYC</Btn>
                </span></td></tr>
            ))}</tbody>
          </table></div><Pager p={pg} />
        </>) : <Empty icon="users" text={investors.length ? "No investors match the filters." : "No investors yet."} />}
      </Card>
      {modal && <Modal title="Onboard / approve investor" onClose={() => setModal(false)}><OnboardForm tokens={tokens} flash={flash} done={() => { setModal(false); refresh(); }} /></Modal>}
      {reviewing && <Modal title="KYC review" onClose={() => setReviewing(null)}><KycReviewModal investor={reviewing} flash={flash} done={() => { setReviewing(null); refresh(); }} /></Modal>}
    </>
  );
}
/* KYC review — inspect the submitted documents, mark verifying, then approve/reject. */
function KycReviewModal({ investor, flash, done }: { investor: Investor; flash: Flash; done: () => void }) {
  const [docs, loading, error] = useAsync(() => api.kycDocuments(investor.wallet), [investor.wallet], [] as KycDocument[]);
  const [amlKey, setAmlKey] = useState(0);
  const [aml] = useAsync(() => api.amlHistory(investor.wallet), [investor.wallet, amlKey], [] as AmlScreening[]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const status = investor.kyc_status;
  const view = async (id: string) => {
    try { const url = await api.kycDocumentBlobUrl(id); window.open(url, "_blank", "noopener"); }
    catch (e: any) { flash(false, e.message); }
  };
  const rescreen = async () => {
    setBusy(true);
    try { const r = await api.amlRescreen(investor.wallet); flash(true, `Re-screened — AML ${r.amlStatus}`); setAmlKey((k) => k + 1); }
    catch (e: any) { flash(false, e.message); }
    finally { setBusy(false); }
  };
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); flash(true, ok); done(); }
    catch (e: any) { flash(false, e.message); }
    finally { setBusy(false); }
  };
  const kb = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(0)} KB`;
  return (
    <div>
      <div className="rv"><div className="k">Investor</div><div className="v">{investor.name ?? "—"} · {investor.email ?? "—"}</div></div>
      <div className="rv"><div className="k">Wallet</div><div className="v mono">{short(investor.wallet)}</div></div>
      <div className="rv"><div className="k">Submitted</div><div className="v">{fmtWhen(investor.kyc_submitted_at)}</div></div>
      <div className="rv"><div className="k">Status</div><div className="v"><Pill tone={status === "verifying" ? "cyan" : undefined}>{status}</Pill></div></div>
      {(() => {
        const docRow = (d: KycDocument) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
            <div><div className="strong" style={{ fontSize: 13 }}>{d.filename}</div><div className="muted" style={{ fontSize: 12 }}>{d.doc_type.replace(/^address:/, "").replace(/_/g, " ")} · {d.mime} · {kb(d.size_bytes)}</div></div>
            <Btn sm kind="ghost" onClick={() => view(d.id)}>View</Btn>
          </div>
        );
        const idDocs = docs.filter((d) => !d.doc_type.startsWith("address:"));
        const addrDocs = docs.filter((d) => d.doc_type.startsWith("address:"));
        return (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>Identity documents</div>
            {loading ? <Loading /> : error ? <div className="banner err">{error}</div> : idDocs.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{idDocs.map(docRow)}</div>
            ) : <div className="muted" style={{ fontSize: 13 }}>No identity documents.</div>}
            <div className="section-label" style={{ marginTop: 16 }}>Proof of address</div>
            {loading ? null : addrDocs.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{addrDocs.map(docRow)}</div>
            ) : <div className="muted" style={{ fontSize: 13 }}>No proof-of-address documents.</div>}
          </>
        );
      })()}

      {(() => {
        const aml = investor.kyc_details?.aml;
        if (!aml) return null;
        const src: Record<string, string> = { salary: "Salary / employment", business: "Business income", investments: "Investment returns", inheritance: "Inheritance / gift", savings: "Personal savings", other: "Other" };
        return (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>AML self-declaration</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Politically exposed (PEP)</span>
                {aml.isPep ? <Pill tone="amber">PEP — {aml.pepDetails || "no detail"}</Pill> : <span className="strong">No</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Source of funds</span><span className="strong">{src[aml.sourceOfFunds ?? ""] ?? aml.sourceOfFunds ?? "—"}</span></div>
              {aml.occupation && <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Occupation</span><span className="strong">{aml.occupation}</span></div>}
              {aml.taxResidency != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Tax residency</span><span className="strong">{aml.taxResidency}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Declarations</span><span className="strong">{aml.sanctionsDeclaration && aml.fundsLegitimateDeclaration ? "✓ sanctions & funds confirmed" : "incomplete"}</span></div>
            </div>
          </>
        );
      })()}
      <div className="section-label" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>AML / sanctions screening</span>
        <Btn sm kind="ghost" disabled={busy} onClick={rescreen}>Re-screen</Btn>
      </div>
      {aml.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Not screened yet — re-screen to run a check.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {aml.slice(0, 4).map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
              <div>
                <div className="strong" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="mono">{short(s.wallet)}</span>
                  <Pill tone={amlTone(s.decision)}>{s.decision}</Pill>
                  {s.sanctioned && <Pill tone="red">sanctions</Pill>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  risk {s.risk_score}/100 · {s.risk_level}{s.categories.length ? " · " + s.categories.join(", ") : ""} · {s.provider}{s.screened_by ? ` · by ${s.screened_by}` : " · auto"}
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{new Date(s.screened_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
      <div className="section-label" style={{ marginTop: 16 }}>Decision</div>
      <Field label="Note (shown to the investor on rejection)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — required to explain a rejection" /></Field>
      <div className="banner info" style={{ marginTop: 4 }}><Icon name="users" size={14} />Approving lets the investor verify non-custodially. Rejecting starts a 24h reapply cooldown.</div>
      <div className="row2" style={{ marginTop: 12 }}>
        {status === "applied"
          ? <Btn kind="ghost" disabled={busy} onClick={() => run(() => api.startVerifyingKyc(investor.wallet), "Marked as under review")}>Start verifying</Btn>
          : <span />}
        <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn kind="ghost" disabled={busy} onClick={() => run(() => api.rejectKyc(investor.wallet, note || "KYC requirements not met"), "KYC rejected")}>Reject</Btn>
          <Btn disabled={busy} onClick={() => run(() => api.approveKyc(investor.wallet, {}), "KYC approved")}>Approve</Btn>
        </span>
      </div>
    </div>
  );
}
function OnboardForm({ tokens, flash, done }: { tokens: TokenInfo[]; flash: Flash; done: () => void }) {
  const [wallet, setWallet] = useState(""); const [name, setName] = useState(""); const [token, setTok] = useState(tokens[0]?.symbol || ""); const [busy, setBusy] = useState(false);
  const approve = async () => { setBusy(true); try { await api.approveKyc(wallet, { name: name || undefined, country: 356 }); flash(true, `KYC approved for ${short(wallet)} — they can self-onboard`); done(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  const custodial = async () => { setBusy(true); try { await api.onboard({ wallet, token, country: 356, name: name || undefined }); flash(true, `Onboarded ${short(wallet)} for ${token}`); done(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  return (
    <div>
      <Field label="Wallet address"><input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" /></Field>
      <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Patel" /></Field>
      <div className="banner info" style={{ marginTop: 4 }}><Icon name="users" size={14} />Approve KYC lets the investor verify non-custodially. Custodial onboard (dev) does it all for one asset.</div>
      <div className="row2">
        <Btn kind="ghost" disabled={busy || !wallet} onClick={approve}>Approve KYC</Btn>
        <span style={{ display: "flex", gap: 8 }}><select className="input" value={token} onChange={(e) => setTok(e.target.value)} style={{ width: 90 }}>{tokens.map((t) => <option key={t.symbol}>{t.symbol}</option>)}</select><Btn disabled={busy || !wallet} onClick={custodial}>Onboard</Btn></span>
      </div>
    </div>
  );
}

/* ============ Team (sub-admins) ============ */
const ADMIN_ROLES = ["issuer_admin", "compliance", "agent"];
function Team({ admin, flash, refresh, rk }: { admin: Admin; flash: Flash; refresh: () => void; rk: number }) {
  const [admins, loading, error] = useAsync(() => api.admins(), [rk], [] as Admin[]);
  const [modal, setModal] = useState(false);
  const update = async (id: string, b: { disabled?: boolean; role?: string }, msg: string) => {
    try { await api.updateAdmin(id, b); flash(true, msg); refresh(); } catch (e: any) { flash(false, e.message); }
  };
  return (
    <>
      <PageHead title="Team" sub="Platform operators — roles, status, and access" actions={<Btn onClick={() => setModal(true)}><Icon name="plus" size={15} />Invite admin</Btn>} />
      <div className="banner info" style={{ marginBottom: 14 }}><Icon name="shield" size={14} />Roles: <b style={{ margin: "0 5px" }}>issuer_admin</b> full control · <b style={{ margin: "0 5px" }}>compliance</b> KYC / accreditation / cases · <b style={{ margin: "0 5px" }}>agent</b> token operations. Privileged token actions still need a second approval (four-eyes).</div>
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : admins.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Admin</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>{admins.map((a) => {
              const isSelf = String(a.id) === String(admin.id);
              return (
                <tr key={a.id}>
                  <td className="strong">{a.email}{isSelf && <span className="muted" style={{ fontSize: 12 }}> · you</span>}<div className="muted" style={{ fontSize: 12 }}>{a.name ?? "—"}</div></td>
                  <td>
                    <select className="input" style={{ width: 150 }} value={a.role} disabled={isSelf} onChange={(e) => update(a.id, { role: e.target.value }, `Role updated to ${e.target.value}`)}>
                      {ADMIN_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{a.disabled ? <Pill tone="red">disabled</Pill> : <Pill tone="green">active</Pill>}</td>
                  <td style={{ textAlign: "right" }}>
                    {a.disabled
                      ? <Btn sm onClick={() => update(a.id, { disabled: false }, `Enabled ${a.email}`)}>Enable</Btn>
                      : <Btn sm kind="ghost" disabled={isSelf} onClick={() => update(a.id, { disabled: true }, `Disabled ${a.email}`)}>Disable</Btn>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty icon="users" text="No admins." />}
      </Card>
      {modal && <Modal title="Invite admin" onClose={() => setModal(false)}><InviteAdmin flash={flash} done={() => { setModal(false); refresh(); }} /></Modal>}
    </>
  );
}
function InviteAdmin({ flash, done }: { flash: Flash; done: () => void }) {
  const [f, setF] = useState({ email: "", name: "", password: "", role: "compliance" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    if (f.password.length < 10) { flash(false, "Password must be at least 10 characters"); return; }
    setBusy(true);
    try { await api.createAdmin({ email: f.email.trim(), password: f.password, role: f.role, name: f.name || undefined }); flash(true, `Invited ${f.email} (${f.role})`); done(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <Field label="Email"><input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="ops@firm.com" /></Field>
      <Field label="Full name"><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Asha Patel" /></Field>
      <Field label="Temporary password"><input value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="≥ 10 characters" /></Field>
      <Field label="Role"><select value={f.role} onChange={(e) => set("role", e.target.value)}>{ADMIN_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
      <Btn block disabled={busy || !f.email || !f.password} onClick={submit}>{busy ? "Creating…" : "Create admin"}</Btn>
    </div>
  );
}

/* ============ Managers (issuer_admin) ============ */
/* ============ Offerings ============ */
/* ============ Offering details ============ */
/**
 * Read-only "View details" for one asset listing: property, documents, token (or
 * the plan for one, when it isn't deployed yet), listing terms, and the owning SPV
 * / manager. When there's no token, a shortcut hands off to the deploy modal.
 */
function OfferingDetails({ id, onDeploy }: { id: string; onDeploy: () => void }) {
  const [d, loading, error] = useAsync(() => api.offeringDetail(id), [id], null as any);
  if (loading) return <Loading />;
  if (error) return <LoadError error={error} retry={() => location.reload()} />;
  if (!d) return null;
  const money = (n: number | null) => (n == null ? "—" : `${d.listing.currency} ${Number(n).toLocaleString()}`);

  return (
    <div>
      <div className="card-h" style={{ paddingLeft: 0 }}><span className="ci"><Icon name="building" size={16} /></span><h3>Property</h3>
        <Pill tone={OFFERING_STATUS_TONE[d.listing.status] ?? "gray"}>{OFFERING_STATUS_LABEL[d.listing.status] ?? d.listing.status}</Pill></div>
      <div className="row2"><Row k="Name" v={d.property.name} /><Row k="Location" v={d.property.location} /></div>
      <div className="row2"><Row k="Property type" v={d.property.propertyType ?? d.property.assetType} /><Row k="Property value" v={money(d.property.value)} /></div>
      {d.property.description && <Row k="Description" v={d.property.description} />}
      {d.property.images?.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          {d.property.images.map((u: string, i: number) => <img key={i} src={u} alt="" style={{ height: 64, borderRadius: 6, border: "1px solid var(--line)" }} />)}
        </div>
      )}

      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="shield" size={16} /></span><h3>Documents</h3><span className="hint">{d.documents.length}</span></div>
      {d.documents.length ? d.documents.map((doc: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <Icon name="shield" size={13} /><span className="strong">{doc.type}</span>
          {doc.name && <span className="muted" style={{ fontSize: 12 }}>{doc.name}</span>}
          <div style={{ marginLeft: "auto" }}>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Open ↗</a> : <span className="muted">no file</span>}</div>
        </div>
      )) : <div className="muted" style={{ fontSize: 13 }}>No documents attached. Add them via <b>Edit</b>.</div>}

      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="gear" size={16} /></span><h3>Token</h3>
        {d.token.deployed ? <Pill tone="cyan">{d.token.symbol}</Pill> : <Pill tone="gray">not deployed</Pill>}</div>
      {d.token.deployed ? (
        <>
          <div className="row2"><Row k="Symbol" v={d.token.symbol} /><Row k="Total tokens" v={d.token.totalTokens.toLocaleString()} /></div>
          <Row k="Contract" v={<ExplorerAddr addr={d.token.address} />} />
          <Row k="Network" v={d.token.network} />
        </>
      ) : (
        <>
          <div className="banner info" style={{ margin: "6px 0 10px" }}><Icon name="building" size={14} />Not deployed yet. Planned: <b style={{ margin: "0 4px" }}>{d.token.plan?.symbol ?? "—"}</b>{d.token.plan?.tokenName ? ` · ${d.token.plan.tokenName}` : ""} · {d.token.totalTokens.toLocaleString()} tokens.</div>
          <Btn sm onClick={onDeploy}><Icon name="plus" size={13} />Deploy token</Btn>
        </>
      )}

      <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="list" size={16} /></span><h3>Listing</h3></div>
      <div className="row2"><Row k="Price / token" v={money(d.listing.pricePerToken)} /><Row k="Total offering" v={money(d.listing.targetRaise)} /></div>
      <div className="row2"><Row k="Minimum investment" v={money(d.listing.minInvestment)} /><Row k="Max / investor" v={money(d.listing.maxInvestment)} /></div>
      <div className="row2"><Row k="Expected yield" v={d.listing.yieldPct == null ? "—" : `${d.listing.yieldPct}%`} /><Row k="Visibility" v={d.listing.visibility} /></div>

      {d.issuer && (
        <>
          <div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="building" size={16} /></span><h3>Issuer (SPV)</h3><Pill>{d.issuer.kybStatus}</Pill></div>
          <div className="row2"><Row k="Name" v={d.issuer.name} /><Row k="SPV ID" v={d.issuer.spvId ?? "—"} /></div>
          <div className="row2"><Row k="SPV type" v={d.issuer.spvType ?? "—"} /><Row k="Owner wallet" v={d.issuer.ownerWallet ? <ExplorerAddr addr={d.issuer.ownerWallet} /> : "—"} /></div>
        </>
      )}
      {d.manager && <><div className="card-h" style={{ paddingLeft: 0, marginTop: 16 }}><span className="ci"><Icon name="users" size={16} /></span><h3>Manager</h3></div><Row k="Name" v={`${d.manager.name}${d.manager.company ? " · " + d.manager.company : ""}`} /></>}
    </div>
  );
}

const OFFERING_STATUS_TONE: Record<string, "green" | "amber" | "cyan" | "red" | "gray"> = { open: "green", coming_soon: "amber", funded: "cyan", cancelled: "red" };
const OFFERING_STATUS_LABEL: Record<string, string> = { open: "Open", coming_soon: "Coming soon", funded: "Funded", cancelled: "Cancelled" };

function OfferingsView({ flash, refresh, rk }: { flash: Flash; refresh: () => void; rk: number }) {
  const [k, setK] = useState(0);
  const bump = () => setK((x) => x + 1);
  const [offerings, loading, error] = useAsync(() => api.offerings(), [rk, k], [] as any[]);
  const [edit, setEdit] = useState<any | null>(null);
  const [deploy, setDeploy] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);

  const setStatus = async (o: any, status: string) => {
    try { await api.updateOffering(o.id, { status }); flash(true, `${o.name} → ${OFFERING_STATUS_LABEL[status] ?? status}`); bump(); refresh(); }
    catch (e: any) { flash(false, e.message); }
  };

  return (
    <>
      <PageHead title="Offerings" sub="Every asset offering — status, token link, and go-live control" />
      <div className="banner info" style={{ marginBottom: 14 }}><Icon name="list" size={14} />An offering is investable only when it has a deployed token <b style={{ margin: "0 4px" }}>and</b> status Open. “Go live” flips a token-backed offering to Open.</div>
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={bump} /> : offerings.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Property</th><th>Token</th><th>Status</th><th>Price</th><th>Funded</th><th>Visibility</th><th></th></tr></thead>
            <tbody>{offerings.map((o) => (
              <tr key={o.id}>
                <td className="strong">{o.name}<div className="muted" style={{ fontSize: 12 }}>{o.location ?? "—"}</div></td>
                <td>
                  {o.tokenSymbol ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                      <Pill tone="cyan">{o.tokenSymbol}</Pill>
                      <span style={{ fontSize: 11 }} className="muted">Contract <ExplorerAddr addr={o.tokenAddress} /></span>
                      <span style={{ fontSize: 11 }} className="muted">Deployer <ExplorerAddr addr={o.owner} /></span>
                    </div>
                  ) : <Pill tone="gray">no token</Pill>}
                </td>
                <td><Pill tone={OFFERING_STATUS_TONE[o.status] ?? "gray"}>{OFFERING_STATUS_LABEL[o.status] ?? o.status}</Pill></td>
                <td>{inr(o.pricePerToken)}</td>
                <td>{Math.round(o.pctFunded ?? 0)}%</td>
                <td className="muted">{o.visibility}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {!o.tokenSymbol
                    ? <Btn sm onClick={() => setDeploy(o)}><Icon name="plus" size={13} />Deploy token</Btn>
                    : o.status === "coming_soon"
                      ? <Btn sm onClick={() => setStatus(o, "open")}><Icon name="check" size={13} />Go live</Btn>
                      : o.status === "open"
                        ? <Btn sm kind="ghost" onClick={() => setStatus(o, "coming_soon")}>Unlist</Btn>
                        : null}
                  <Btn sm kind="ghost" style={{ marginLeft: 6 }} onClick={() => setDetails(o)}>View details</Btn>
                  <Btn sm kind="subtle" style={{ marginLeft: 6 }} onClick={() => setEdit(o)}>Edit</Btn>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon="list" text="No offerings yet. Create one via Issuers → Create asset." />}
      </Card>
      {edit && <Modal wide title={`Edit — ${edit.name}`} onClose={() => setEdit(null)}><OfferingEdit o={edit} flash={flash} done={() => { setEdit(null); bump(); refresh(); }} /></Modal>}
      {deploy && <Modal title={`Deploy token — ${deploy.name}`} onClose={() => setDeploy(null)}><DeployTokenModal o={deploy} flash={flash} done={() => { setDeploy(null); bump(); refresh(); }} /></Modal>}
      {details && <Modal wide title={`Asset details — ${details.name}`} onClose={() => setDetails(null)}><OfferingDetails id={details.id} onDeploy={() => { setDetails(null); setDeploy(details); }} /></Modal>}
    </>
  );
}

function DeployTokenModal({ o, flash, done }: { o: any; flash: Flash; done: () => void }) {
  // Everything the deploy needs is already recorded — pull it and CONFIRM, don't re-ask.
  const [d, loading, error] = useAsync(() => api.offeringDetail(o.id), [o.id], null as any);
  const [issuers] = useAsync(() => api.issuers(), [], [] as Issuer[]);
  const approved = issuers.filter((i) => i.kyb_status === "approved" && i.owner_wallet);
  const [pickIssuer, setPickIssuer] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1); // -1 idle; 0..N running; N+1 done

  if (loading) return <Loading />;
  if (error) return <LoadError error={error} retry={() => location.reload()} />;
  if (!d) return null;

  const plan = (d.token?.plan ?? {}) as any;
  // The eight things baked into the on-chain token — derived from what you already entered.
  const summary = {
    tokenName: plan.tokenName || d.property?.name || o.name,
    symbol: (plan.symbol || d.token?.symbol || "").toUpperCase(),
    issuerName: d.issuer?.name ?? null,
    ownerWallet: d.issuer?.ownerWallet ?? null,
    maxHolders: plan.maxHolders ?? 500,
    lockupDays: plan.lockupDays ?? 0,
    decimals: 0,
    requiresAccreditation: (d.listing?.requiresAccreditation || plan.requiresAccreditation) === true,
    goLive: (plan.intendedStatus ?? d.listing?.status) === "open",
    totalTokens: d.token?.totalTokens ?? 0,
    network: d.token?.network ?? "—",
  };
  // Issuer is fixed when the asset is linked to an SPV; only a legacy unlinked
  // offering needs a pick.
  const issuerId = d.issuer?.id ? String(d.issuer.id) : pickIssuer;
  const needsPick = !d.issuer?.id;

  const DEPLOY_STAGES = [
    "Submitting deploy transaction…",
    "Deploying T-REX token suite on-chain…",
    "Configuring identity registry & compliance…",
    "Registering claim topics & token agents…",
    "Unpausing token for settlement…",
    "Finalizing listing…",
  ];

  const submit = async () => {
    if (!issuerId) { flash(false, "Select an approved issuer."); return; }
    if (!summary.symbol) { flash(false, "This asset has no token symbol recorded."); return; }
    setBusy(true); setStage(0);
    // The deploy is one call but several on-chain txs (2-3 min). Advance the stage
    // labels on a timer so the wait shows progress; hold on the last until it resolves.
    const timer = setInterval(() => setStage((sg) => Math.min(sg + 1, DEPLOY_STAGES.length - 1)), 22000);
    try {
      await api.deployTokenForOffering(o.id, { issuerId, symbol: summary.symbol, maxHolders: +summary.maxHolders, lockupDays: +summary.lockupDays });
      clearInterval(timer); setStage(DEPLOY_STAGES.length);
      flash(true, `Deployed ${summary.symbol} for ${o.name}`);
      setTimeout(done, 700);
    } catch (e: any) {
      clearInterval(timer); setStage(-1); setBusy(false);
      flash(false, e.message);
    }
  };

  // --- deploying view: staged progress ---
  if (busy || stage >= 0) {
    const pctDone = Math.min(stage + 1, DEPLOY_STAGES.length) / DEPLOY_STAGES.length * 100;
    const finished = stage >= DEPLOY_STAGES.length;
    return (
      <div>
        <div className="banner info" style={{ marginBottom: 14 }}><Icon name="building" size={14} />
          Deploying <b style={{ margin: "0 4px" }}>{summary.symbol}</b> on {summary.network}. This takes a few minutes — keep this open.
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${finished ? 100 : pctDone}%`, background: "var(--accent)", transition: "width .5s" }} />
        </div>
        {DEPLOY_STAGES.map((label, i) => {
          const state = finished || i < stage ? "done" : i === stage ? "active" : "todo";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", opacity: state === "todo" ? 0.4 : 1 }}>
              <span style={{ width: 18, textAlign: "center" }}>
                {state === "done" ? <span style={{ color: "var(--green)" }}>✓</span> : state === "active" ? <span className="spinner" /> : "○"}
              </span>
              <span style={{ fontSize: 13.5 }}>{label}</span>
            </div>
          );
        })}
        {finished && <div className="banner" style={{ marginTop: 12, background: "rgba(52,211,153,.12)", color: "var(--green)" }}><Icon name="check" size={14} />Token deployed — {summary.goLive ? "listing is now live." : "set it Open when ready."}</div>}
      </div>
    );
  }

  // --- confirm view: the 8 recorded values + one Deploy button ---
  return (
    <div>
      <div className="banner info" style={{ marginBottom: 12 }}><Icon name="building" size={14} />
        Review the on-chain parameters — all recorded when you created the asset. Deploying is irreversible and costs gas.
      </div>
      <div className="row2">
        <Row k="Token name" v={summary.tokenName} />
        <Row k="Symbol" v={<span className="mono">{summary.symbol || "—"}</span>} />
      </div>
      <div className="row2">
        <Row k="Issuer (SPV)" v={summary.issuerName ?? (needsPick ? "— pick below —" : "—")} />
        <Row k="Owner wallet" v={summary.ownerWallet ? <ExplorerAddr addr={summary.ownerWallet} /> : "—"} />
      </div>
      <div className="row2">
        <Row k="Total tokens" v={summary.totalTokens.toLocaleString()} />
        <Row k="Decimals" v={summary.decimals} />
      </div>
      <div className="row2">
        <Row k="Max holders" v={summary.maxHolders} />
        <Row k="Lock-up" v={`${summary.lockupDays} days`} />
      </div>
      <div className="row2">
        <Row k="Eligibility" v={summary.requiresAccreditation ? "Accredited only" : "Any KYC-verified investor"} />
        <Row k="On deploy" v={summary.goLive ? <Pill tone="green">goes Live</Pill> : <Pill tone="amber">stays coming soon</Pill>} />
      </div>
      <Row k="Network" v={summary.network} />

      {needsPick && (
        <Field label="Issuer (KYB-approved, owns the token)">
          <select value={pickIssuer} onChange={(e) => setPickIssuer(e.target.value)}>
            <option value="">— Select an issuer —</option>
            {approved.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
      )}
      <Btn block disabled={busy || (needsPick && !pickIssuer)} onClick={submit} style={{ marginTop: 12 }}>Deploy token</Btn>
    </div>
  );
}

function OfferingEdit({ o, flash, done }: { o: any; flash: Flash; done: () => void }) {
  const [f, setF] = useState<Record<string, string>>({
    name: o.name ?? "", location: o.location ?? "", image: o.image ?? "", pricePerToken: String(o.pricePerToken ?? ""),
    minInvestment: String(o.minInvestment ?? ""), targetRaise: String(o.targetRaise ?? ""),
    tokenSymbol: o.tokenSymbol ?? "", status: o.status, visibility: o.visibility,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { flash(false, "Choose an image file."); return; }
    if (file.size > 6 * 1024 * 1024) { flash(false, "Image must be under 6 MB."); return; }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read that file."));
        r.readAsDataURL(file);
      });
      const { url } = await api.uploadImage(dataUrl);
      set("image", url); flash(true, "Image uploaded.");
    } catch (err: any) { flash(false, err.message ?? "Upload failed."); } finally { setUploading(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.updateOffering(o.id, {
        name: f.name.trim(), location: f.location.trim() || null, image: f.image.trim() || null,
        pricePerToken: +f.pricePerToken, minInvestment: +f.minInvestment, targetRaise: +f.targetRaise,
        tokenSymbol: f.tokenSymbol.trim() || null, status: f.status, visibility: f.visibility,
      });
      flash(true, "Offering updated"); done();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <Field label="Name"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Location"><input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Mumbai, IN" /></Field>
      <Field label="Image">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="Paste a URL, or upload →" className="mono" style={{ flex: 1 }} />
          <Btn kind="ghost" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "Upload"}</Btn>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        </div>
      </Field>
      {f.image.trim() && <img src={f.image} alt="preview" style={{ width: "100%", maxWidth: 280, aspectRatio: "16/10", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 }} />}
      <div className="row2">
        <Field label="Price / token (₹)"><input value={f.pricePerToken} onChange={(e) => set("pricePerToken", e.target.value)} inputMode="numeric" /></Field>
        <Field label="Min investment (₹)"><input value={f.minInvestment} onChange={(e) => set("minInvestment", e.target.value)} inputMode="numeric" /></Field>
      </div>
      <div className="row2">
        <Field label="Target raise (₹)"><input value={f.targetRaise} onChange={(e) => set("targetRaise", e.target.value)} inputMode="numeric" /></Field>
        <Field label="Token symbol (link a deployed token)"><input value={f.tokenSymbol} onChange={(e) => set("tokenSymbol", e.target.value)} placeholder="e.g. MBWT" className="mono" /></Field>
      </div>
      <div className="row2">
        <Field label="Status"><select value={f.status} onChange={(e) => set("status", e.target.value)}>{["coming_soon", "open", "funded"].map((s) => <option key={s} value={s}>{OFFERING_STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label="Visibility"><select value={f.visibility} onChange={(e) => set("visibility", e.target.value)}>{["public", "private"].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Setting status to <b>Open</b> requires a deployed token — link one above or deploy via Issuers → Create asset.</div>
      <Btn block disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Btn>
    </div>
  );
}

function Managers({ flash, rk }: { flash: Flash; rk: number }) {
  const [k, setK] = useState(0);
  const bump = () => setK((x) => x + 1);
  const [managers, mLoading, mErr] = useAsync(() => api.managers(), [rk, k], [] as Manager[]);
  const [offerings] = useAsync(() => api.offerings(), [rk, k], [] as any[]);
  const [modal, setModal] = useState(false);
  const toggle = async (m: Manager) => {
    try { await api.updateManager(m.id, { status: m.status === "active" ? "suspended" : "active" }); flash(true, `${m.name} ${m.status === "active" ? "suspended" : "reactivated"}`); bump(); }
    catch (e: any) { flash(false, e.message); }
  };
  const assign = async (offeringId: string, managerId: string) => {
    try { await api.assignManager(offeringId, managerId || null); flash(true, "Manager assigned"); bump(); }
    catch (e: any) { flash(false, e.message); }
  };
  return (
    <>
      <PageHead title="Managers" sub="Property managers who operate assets and answer investors" actions={<Btn onClick={() => setModal(true)}><Icon name="plus" size={15} />Add manager</Btn>} />
      <div className="banner info" style={{ marginBottom: 14 }}><Icon name="users" size={14} />A manager operates one or more properties: they post updates and can declare distributions for their own assets. Give them a login to open their scoped portal.</div>
      <Card pad={false}>
        {mLoading ? <Loading /> : mErr ? <LoadError error={mErr} retry={bump} /> : managers.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Manager</th><th>Company</th><th>Login</th><th>Status</th><th></th></tr></thead>
            <tbody>{managers.map((m) => (
              <tr key={m.id}>
                <td className="strong">{m.name}<div className="muted" style={{ fontSize: 12 }}>{m.contactEmail ?? "—"}</div></td>
                <td className="muted">{m.company ?? "—"}</td>
                <td>{m.hasLogin ? <Pill tone="cyan">has portal</Pill> : <Pill>no login</Pill>}</td>
                <td>{m.status === "active" ? <Pill tone="green">active</Pill> : <Pill tone="red">suspended</Pill>}</td>
                <td style={{ textAlign: "right" }}><Btn sm kind="ghost" onClick={() => toggle(m)}>{m.status === "active" ? "Suspend" : "Reactivate"}</Btn></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon="users" text="No managers yet." />}
      </Card>

      <div className="section-label" style={{ marginTop: 20 }}>Assign managers & buybacks</div>
      <Card pad={false}>
        {offerings.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Property</th><th>Token</th><th>Manager</th><th>Seller buyback</th><th>Governance</th></tr></thead>
            <tbody>{offerings.map((o) => (
              <tr key={o.id}>
                <td className="strong">{o.name}<div className="muted" style={{ fontSize: 12 }}>{o.location ?? "—"}</div></td>
                <td className="mono">{o.tokenSymbol ?? "—"}</td>
                <td>
                  <select className="input" style={{ width: 170 }} value={o.managerId ?? ""} onChange={(e) => assign(o.id, e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {managers.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td><BuybackCell o={o} flash={flash} onChange={bump} /></td>
                <td><GovernanceCell o={o} managers={managers} flash={flash} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon="building" text="No properties to assign yet." />}
      </Card>
      {modal && <Modal title="Add manager" onClose={() => setModal(false)}><AddManager flash={flash} done={() => { setModal(false); bump(); }} /></Modal>}
    </>
  );
}
function AddManager({ flash, done }: { flash: Flash; done: () => void }) {
  const [f, setF] = useState({ name: "", company: "", contactEmail: "", bio: "", loginEmail: "", loginPassword: "" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    if (!f.name.trim()) { flash(false, "Name is required"); return; }
    if (f.loginEmail && f.loginPassword.length < 10) { flash(false, "A login password must be at least 10 characters"); return; }
    setBusy(true);
    try {
      await api.createManager({ name: f.name.trim(), company: f.company || undefined, contactEmail: f.contactEmail || undefined, bio: f.bio || undefined, loginEmail: f.loginEmail || undefined, loginPassword: f.loginEmail ? f.loginPassword : undefined });
      flash(true, `Added ${f.name}`); done();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="row2"><Field label="Name"><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Asha Patel" /></Field><Field label="Company"><input value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Meridian PM" /></Field></div>
      <Field label="Contact email"><input value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="asha@meridian.com" /></Field>
      <Field label="Bio (shown to investors)"><textarea value={f.bio} onChange={(e) => set("bio", e.target.value)} rows={2} placeholder="15 years managing residential real estate in Pune." /></Field>
      <div className="banner info" style={{ margin: "10px 0" }}><Icon name="shield" size={14} />Optional: give this manager a login for their scoped portal.</div>
      <div className="row2"><Field label="Login email (optional)"><input value={f.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} placeholder="asha@meridian.com" /></Field><Field label="Login password"><input value={f.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} placeholder="≥ 10 characters" /></Field></div>
      <Btn block disabled={busy || !f.name.trim()} onClick={submit}>{busy ? "Adding…" : "Add manager"}</Btn>
    </div>
  );
}

function BuybackCell({ o, flash, onChange }: { o: any; flash: Flash; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ sellerWallet: o.sellerWallet ?? "", pricePerToken: String(o.navPerToken || o.pricePerToken || ""), maxTokens: "" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const bb = o.buyback;
  const close = async () => { setBusy(true); try { await api.closeBuyback(o.id); flash(true, "Buyback closed"); onChange(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  const submit = async () => {
    if (!(+f.pricePerToken > 0)) { flash(false, "Enter a price per token"); return; }
    setBusy(true);
    try { await api.openBuyback(o.id, { sellerWallet: f.sellerWallet.trim() || undefined, pricePerToken: +f.pricePerToken, maxTokens: f.maxTokens.trim() ? +f.maxTokens : null }); flash(true, "Buyback opened"); setOpen(false); onChange(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  if (bb?.active) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Pill tone="amber">₹{bb.pricePerToken}/tok{bb.remaining != null ? ` · ${bb.remaining} left` : ""}</Pill>
      <Btn sm kind="ghost" disabled={busy} onClick={close}>Close</Btn>
    </div>
  );
  return (
    <>
      <Btn sm kind="ghost" disabled={!o.tokenSymbol} onClick={() => setOpen(true)}>Open buyback</Btn>
      {open && <Modal title={`Open buyback — ${o.name}`} onClose={() => setOpen(false)}>
        <div className="banner info" style={{ marginBottom: 10 }}><Icon name="shield" size={14} />Holders can sell tokens back to the seller wallet at this price. The transfer is signed by the investor; payout settles off-chain.</div>
        <Field label="Seller wallet"><input value={f.sellerWallet} onChange={(e) => set("sellerWallet", e.target.value)} placeholder="0x… (owner buying back)" /></Field>
        <div className="row2"><Field label="Price / token (₹)"><input value={f.pricePerToken} onChange={(e) => set("pricePerToken", e.target.value)} placeholder="1050" /></Field><Field label="Max tokens (optional)"><input value={f.maxTokens} onChange={(e) => set("maxTokens", e.target.value)} placeholder="budget cap" /></Field></div>
        <Btn block disabled={busy} onClick={submit}>{busy ? "Opening…" : "Open buyback"}</Btn>
      </Modal>}
    </>
  );
}

function GovernanceCell({ o, managers, flash }: { o: any; managers: Manager[]; flash: Flash }) {
  const [k, setK] = useState(0);
  const [proposals] = useAsync(() => (o.tokenSymbol ? api.proposals(o.id) : Promise.resolve([])), [o.id, k], [] as any[]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = proposals.find((p) => p.status === "open");
  const closeVote = async () => {
    setBusy(true);
    try { const r: any = await api.closeProposal(active.id); flash(true, `Vote ${r.status} (for ${r.for} / against ${r.against})`); setK((x) => x + 1); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  if (active) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Pill tone="cyan">vote: {active.forWeight}↑ / {active.againstWeight}↓</Pill>
      <Btn sm kind="ghost" disabled={busy} onClick={closeVote}>Close</Btn>
    </div>
  );
  return (
    <>
      <Btn sm kind="ghost" disabled={!o.tokenSymbol || managers.length === 0} onClick={() => setOpen(true)}>Propose change</Btn>
      {open && <Modal title={`Propose manager change — ${o.name}`} onClose={() => setOpen(false)}><ProposeChange o={o} managers={managers} flash={flash} done={() => { setOpen(false); setK((x) => x + 1); }} /></Modal>}
    </>
  );
}
function ProposeChange({ o, managers, flash, done }: { o: any; managers: Manager[]; flash: Flash; done: () => void }) {
  const active = managers.filter((m) => m.status === "active" && String(m.id) !== String(o.managerId));
  const [f, setF] = useState({ proposedManagerId: active[0]?.id ?? "", reason: "", days: "7" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    if (!f.proposedManagerId) { flash(false, "Pick a manager to propose"); return; }
    const closesAt = new Date(Date.now() + Math.max(1, +f.days) * 86400000).toISOString();
    setBusy(true);
    try { await api.createProposal(o.id, { proposedManagerId: String(f.proposedManagerId), reason: f.reason || undefined, closesAt }); flash(true, "Proposal opened"); done(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="banner info" style={{ marginBottom: 10 }}><Icon name="users" size={14} />Holders vote weighted by their on-chain balance. If it passes on close, the new manager is applied automatically.</div>
      <Field label="Proposed new manager"><select value={f.proposedManagerId} onChange={(e) => set("proposedManagerId", e.target.value)}>{active.length ? active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>) : <option value="">No other active managers</option>}</select></Field>
      <Field label="Reason (shown to voters)"><textarea value={f.reason} onChange={(e) => set("reason", e.target.value)} rows={2} placeholder="Poor responsiveness; proposing a new operator." /></Field>
      <Field label="Voting window (days)"><input value={f.days} onChange={(e) => set("days", e.target.value)} /></Field>
      <Btn block disabled={busy || !f.proposedManagerId} onClick={submit}>{busy ? "Opening…" : "Open proposal"}</Btn>
    </div>
  );
}

/* ============ Manager portal (scoped login, role=manager) ============ */
function ManagerPortal({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [k, setK] = useState(0);
  const [props, loading, err] = useAsync(() => api.myProperties(), [k], [] as any[]);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const flash: Flash = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 5000); };
  return (
    <div className="shell" style={{ gridTemplateColumns: "1fr" }}>
      <main className="main">
        <div className="topbar">
          <h1>My properties</h1>
          <div className="topbar-right">
            <span className="muted" style={{ fontSize: 13 }}>{admin.email} · manager</span>
            <button className="btn ghost sm" onClick={onLogout} title="Sign out"><Icon name="logout" size={14} /></button>
          </div>
        </div>
        <div className="content">
          {loading ? <Loading /> : err ? <LoadError error={err} retry={() => setK((x) => x + 1)} /> : props.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {props.map((o) => <ManagedProperty key={o.id} o={o} flash={flash} />)}
            </div>
          ) : <Empty icon="building" text="No properties assigned to you yet. An admin assigns properties to your manager profile." />}
        </div>
      </main>
      <div className="toast-wrap">{toast && <div className={`toast ${toast.ok ? "ok" : "err"}`}><Icon name={toast.ok ? "check" : "x"} size={15} />{toast.msg}</div>}</div>
    </div>
  );
}
function ManagedProperty({ o, flash }: { o: any; flash: Flash }) {
  const [k, setK] = useState(0);
  const [updates] = useAsync(() => api.propertyUpdates(o.id), [o.id, k], [] as any[]);
  const [dist, setDist] = useState({ amount: "", note: "" });
  const [upd, setUpd] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const declare = async () => {
    if (!o.tokenSymbol) { flash(false, "This property has no token yet."); return; }
    if (!(+dist.amount > 0)) { flash(false, "Enter a positive amount."); return; }
    setBusy(true);
    try { await api.distribute(o.tokenSymbol, dist.amount, dist.note); flash(true, `Declared ₹${dist.amount} distribution for ${o.tokenSymbol}`); setDist({ amount: "", note: "" }); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  const post = async () => {
    if (!upd.title.trim() || !upd.body.trim()) { flash(false, "Title and body are required."); return; }
    setBusy(true);
    try { await api.postPropertyUpdate(o.id, { title: upd.title.trim(), body: upd.body.trim() }); flash(true, "Update posted"); setUpd({ title: "", body: "" }); setK((x) => x + 1); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div><div className="strong" style={{ fontSize: 15 }}>{o.name}</div><div className="muted" style={{ fontSize: 12 }}>{o.location ?? "—"} · {o.tokenSymbol ?? "no token"} · {o.holders ?? 0} holders</div></div>
        {o.occupancyPct != null && <Pill tone="cyan">{Math.round(o.occupancyPct)}% occupied</Pill>}
      </div>
      <div className="row2">
        <div>
          <div className="section-label">Declare distribution</div>
          <Field label="Amount (₹)"><input value={dist.amount} onChange={(e) => setDist((s) => ({ ...s, amount: e.target.value }))} placeholder="120000" /></Field>
          <Field label="Note"><input value={dist.note} onChange={(e) => setDist((s) => ({ ...s, note: e.target.value }))} placeholder="Q2 rent" /></Field>
          <Btn sm disabled={busy} onClick={declare}>Declare payout</Btn>
        </div>
        <div>
          <div className="section-label">Post an update</div>
          <Field label="Title"><input value={upd.title} onChange={(e) => setUpd((s) => ({ ...s, title: e.target.value }))} placeholder="New tenant signed" /></Field>
          <Field label="Body"><textarea value={upd.body} onChange={(e) => setUpd((s) => ({ ...s, body: e.target.value }))} rows={2} placeholder="A 3-year lease was signed this month…" /></Field>
          <Btn sm disabled={busy} onClick={post}>Post update</Btn>
        </div>
      </div>
      {updates.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-label">Recent updates</div>
          {updates.slice(0, 3).map((u: any) => (
            <div key={u.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
              <div className="strong" style={{ fontSize: 13 }}>{u.title} <span className="muted" style={{ fontWeight: 400 }}>· {new Date(u.createdAt).toLocaleDateString()}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>{u.body}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============ Approvals ============ */
function Approvals({ admin, flash, refresh, rk }: { admin: Admin; flash: Flash; refresh: () => void; rk: number }) {
  const [ops, loading, error] = useAsync(() => api.operations(), [rk], [] as OperationRequest[]);
  const pending = ops.filter((o) => o.status === "pending");
  const recent = ops.filter((o) => o.status !== "pending");
  const ppg = usePaged(pending, 8);
  const rpg = usePaged(recent, 8);
  const decide = async (id: string, ok: boolean) => { try { const r: any = ok ? await api.approveOp(id) : await api.rejectOp(id); flash(true, ok ? (r.status === "executed" ? `Approved & executed #${id}` : `Approved #${id}`) : `Rejected #${id}`); refresh(); } catch (e: any) { flash(false, e.message); } };
  return (
    <>
      <PageHead title="Approvals" sub={`Four-eyes queue — you (${admin.email}) can't approve your own request`} />
      <div className="section-label">Pending · {pending.length}</div>
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : pending.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Action</th><th>Details</th><th>Requested by</th><th></th></tr></thead>
            <tbody>{ppg.slice.map((o) => (
              <tr key={o.id}><td className="mono">#{o.id}</td><td className="strong">{o.action}{o.token_symbol ? ` · ${o.token_symbol}` : ""}{o.case_id ? <Pill tone="purple">case {o.case_id}</Pill> : null}</td><td className="muted">{describe(o)}</td><td className="muted">{o.requested_by_email}</td>
                <td style={{ textAlign: "right" }}><span style={{ display: "inline-flex", gap: 7 }}><Btn sm onClick={() => decide(o.id, true)}>Approve</Btn><Btn sm kind="ghost" onClick={() => decide(o.id, false)}>Reject</Btn></span></td></tr>
            ))}</tbody>
          </table></div><Pager p={ppg} />
        </>) : <Empty icon="check" text="Nothing awaiting approval." />}
      </Card>
      <div className="section-label">Recently decided</div>
      <Card pad={false}>
        {recent.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Action</th><th>Status</th><th>Tx / reason</th></tr></thead>
            <tbody>{rpg.slice.map((o) => (
              <tr key={o.id}><td className="mono">#{o.id}</td><td className="strong">{o.action}{o.token_symbol ? ` · ${o.token_symbol}` : ""}</td>
                <td><Pill tone={o.status === "executed" ? "green" : o.status === "failed" ? "red" : "gray"}>{o.status}</Pill></td>
                <td className="mono muted"><TxLink hash={o.tx_hash} alt={(o.status === "failed" || o.status === "rejected") && o.error ? <span style={{ color: "var(--red)" }}>{o.error}</span> : "—"} /></td></tr>
            ))}</tbody>
          </table></div><Pager p={rpg} />
        </>) : <Empty icon="list" text="No history yet." />}
      </Card>
    </>
  );
}
function describe(o: OperationRequest): string {
  const p = o.params || {};
  if (o.action === "mint") return `${p.amount} → ${short(p.investor)}`;
  if (o.action === "burn") return `${p.amount} from ${short(p.wallet)}`;
  if (o.action === "force-transfer") return `${p.amount}: ${short(p.from)} → ${short(p.to)}`;
  if (o.action === "pause") return p.paused ? "pause trading" : "unpause trading";
  return "";
}

/* ============ Legal Cases ============ */
function Cases({ flash, refresh, rk, tokens }: { flash: Flash; refresh: () => void; rk: number; tokens: TokenInfo[] }) {
  const [cases, loading, error] = useAsync(() => api.cases(), [rk], [] as LegalCase[]);
  const [openId, setOpenId] = useState<string | null>(null); const [modal, setModal] = useState(false);
  const pg = usePaged(cases, 8);
  return (
    <>
      <PageHead title="Legal Cases" sub="Court orders & compliance actions, with a defensible trail" actions={<Btn onClick={() => setModal(true)}><Icon name="plus" size={15} />Open case</Btn>} />
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : cases.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Reference</th><th>Type</th><th>Subject</th><th>Status</th><th></th></tr></thead>
            <tbody>{pg.slice.map((c) => (
              <Fragment key={c.id}>
                <tr><td className="strong">{c.reference}</td><td className="muted">{c.type.replace("_", " ")}</td><td className="mono">{c.subject_wallet ? short(c.subject_wallet) : "—"}</td><td><Pill>{c.status}</Pill></td>
                  <td style={{ textAlign: "right" }}><Btn sm kind="ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? "Hide" : "Open"}</Btn></td></tr>
                {openId === c.id && <tr><td colSpan={5} style={{ padding: 0 }}><CaseDetail id={c.id} status={c.status} flash={flash} refresh={refresh} rk={rk} tokens={tokens} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div><Pager p={pg} />
        </>) : <Empty icon="scale" text="No cases yet." />}
      </Card>
      {modal && <Modal title="Open legal case" onClose={() => setModal(false)}><OpenCase flash={flash} done={() => { setModal(false); refresh(); }} /></Modal>}
    </>
  );
}
function OpenCase({ flash, done }: { flash: Flash; done: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ reference: "", type: "court_order", subjectWallet: "", description: "" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const go = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await api.openCase({ reference: f.reference, type: f.type, subjectWallet: f.subjectWallet || undefined, description: f.description || undefined }); flash(true, `Opened case ${f.reference}`); done(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  return (
    <form onSubmit={go}>
      <div className="row2"><Field label="Case reference"><input value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="WP-2026-1234" required /></Field>
        <Field label="Type"><select value={f.type} onChange={(e) => set("type", e.target.value)}>{["court_order", "sanctions", "fraud", "recovery", "dispute", "other"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></Field></div>
      <Field label="Subject wallet"><input value={f.subjectWallet} onChange={(e) => set("subjectWallet", e.target.value)} placeholder="0x…" /></Field>
      <Field label="Description"><input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Lost-key recovery / sanctions seizure …" /></Field>
      <Btn block disabled={busy}>{busy ? "Opening…" : "Open case"}</Btn>
    </form>
  );
}
function CaseDetail({ id, status, flash, refresh, rk, tokens }: { id: string; status: string; flash: Flash; refresh: () => void; rk: number; tokens: TokenInfo[] }) {
  const [c] = useAsync(() => api.caseDetail(id), [id, rk], null as LegalCase | null);
  const [f, setF] = useState<Record<string, string>>({ oldWallet: "", newWallet: "", token: tokens[0]?.symbol || "" });
  const [busy, setBusy] = useState(false); const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const recover = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { const r: any = await api.recover(id, f); flash(true, `Recovery: ${(r.steps || []).join("; ")}`); refresh(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  const close = async () => { try { await api.closeCase(id); flash(true, "Case closed"); refresh(); } catch (e: any) { flash(false, e.message); } };
  const ops = c?.operations ?? []; const audit = c?.audit ?? [];
  return (
    <div className="expand">
      <div className="section-label" style={{ margin: "0 0 10px" }}>Action trail</div>
      {ops.length || audit.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <tbody>
            {ops.map((o) => <tr key={"o" + o.id}><td><Pill>{o.status}</Pill></td><td className="strong">{o.action} {o.token_symbol}</td><td className="mono muted"><TxLink hash={o.tx_hash} alt="" /></td></tr>)}
            {audit.map((a) => <tr key={"a" + a.id}><td><Pill>{a.action.split(":")[0]}</Pill></td><td className="muted">{a.action} · {a.actor_email}</td><td className="mono muted"><TxLink hash={a.tx_hash} alt="" /></td></tr>)}
          </tbody>
        </table></div>
      ) : <div className="muted" style={{ fontSize: 13 }}>No actions yet.</div>}
      {status === "open" && (
        <form onSubmit={recover} style={{ marginTop: 14 }}>
          <div className="section-label" style={{ margin: "0 0 8px" }}>Guided recovery · link new → register → freeze old → force-transfer</div>
          <div className="row2"><Field label="Old (lost) wallet"><input value={f.oldWallet} onChange={(e) => set("oldWallet", e.target.value)} placeholder="0x…" required /></Field><Field label="New wallet"><input value={f.newWallet} onChange={(e) => set("newWallet", e.target.value)} placeholder="0x…" required /></Field></div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field label="Asset"><select value={f.token} onChange={(e) => set("token", e.target.value)}>{tokens.map((t) => <option key={t.symbol}>{t.symbol}</option>)}</select></Field>
            <Btn sm disabled={busy} type="submit">{busy ? "Running…" : "Recover"}</Btn><Btn sm kind="ghost" type="button" onClick={close}>Close case</Btn>
          </div>
        </form>
      )}
    </div>
  );
}

/* ============ Orders ============ */
function Orders({ rk, refresh }: { rk: number; refresh: () => void }) {
  const [subs, loading, error] = useAsync(() => api.subscriptions(), [rk], [] as Subscription[]);
  const settled = subs.filter((s) => s.status === "settled");
  const raised = settled.reduce((s, x) => s + Number(x.amount_fiat), 0);
  const pg = usePaged(subs, 8);
  return (
    <>
      <PageHead title="Orders" sub="Payment reconciliation — fiat ↔ tokens ↔ tx" />
      <div className="stats">
        <Stat icon="receipt" label="Orders" value={subs.length} />
        <Stat icon="check" tone="green" label="Settled" value={settled.length} sub="payment → mint" />
        <Stat icon="coins" tone="purple" label="Captured" value={inr(raised)} sub="settled orders" />
      </div>
      <div style={{ marginTop: 16 }}><Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : subs.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>Investor</th><th className="num">Amount</th><th className="num">Tokens</th><th>Status</th><th>Tx</th></tr></thead>
            <tbody>{pg.slice.map((s) => (
              <tr key={s.id}><td className="mono">{s.reference.slice(0, 14)}…</td><td className="mono muted">{short(s.wallet)}</td><td className="num strong">{inr(Number(s.amount_fiat))}</td><td className="num">{s.tokens} {s.token_symbol}</td><td><Pill>{s.status}</Pill></td><td className="mono muted"><TxLink hash={s.tx_hash} /></td></tr>
            ))}</tbody>
          </table></div><Pager p={pg} />
        </>) : <Empty icon="receipt" text="No orders yet." />}
      </Card></div>
    </>
  );
}

/* ============ Audit ============ */
function AuditView({ rk, refresh }: { rk: number; refresh: () => void }) {
  const [rows, loading, error] = useAsync(() => api.audit(), [rk], [] as AuditRow[]);
  const pg = usePaged(rows, 10);
  return (
    <>
      <PageHead title="Audit Log" sub="Every privileged action — actor, result, and tx" />
      <Card pad={false}>
        {loading ? <Loading /> : error ? <LoadError error={error} retry={refresh} /> : rows.length ? (<>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Result</th><th>Tx</th><th>When</th></tr></thead>
            <tbody>{pg.slice.map((r) => (
              <tr key={r.id}><td className="strong">{r.action}</td><td className="mono muted">{r.target ? short(r.target) : "—"}</td><td className="muted">{r.actor_email ?? "investor"}{r.actor_role ? ` · ${r.actor_role}` : ""}</td><td><Pill>{r.status}</Pill></td><td className="mono muted"><TxLink hash={r.tx_hash} /></td><td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td></tr>
            ))}</tbody>
          </table></div><Pager p={pg} />
        </>) : <Empty icon="list" text="No audited actions yet." />}
      </Card>
    </>
  );
}
