// Typed client for the RWA backend (authenticated, multi-asset).
//
// Auth is a server-set httpOnly cookie (not readable by JS → not stealable via
// XSS), sent automatically with `credentials: "include"`. We only keep a
// non-sensitive "is a session present" FLAG in localStorage so the UI can render
// optimistically; the real check is the server (`/me` 200 vs 401). For mutating
// requests we echo the CSRF cookie back in the X-CSRF-Token header.
// CUTOVER 2026-08-22: the NestJS app (:4100) is the front door. It proxies
// anything not yet ported back to the Express app on :4000, so nothing is lost.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4100";

// All calls go to the Nest backend (2026-08-23): orders moved to
// /api/admin/subscriptions, asset creation to /api/admin/issuers/:id/assets,
// and /api/uploads is served by Nest directly.

const FLAG_KEY = "rwa_admin_session";
let loggedIn = localStorage.getItem(FLAG_KEY) === "1";

// Named setToken/getToken for call-site compatibility; they no longer touch the
// JWT — `t` is only used as a truthy "logged in" signal.
export function setToken(t: string | null) {
  loggedIn = !!t;
  if (t) localStorage.setItem(FLAG_KEY, "1");
  else localStorage.removeItem(FLAG_KEY);
}
export function getToken() {
  return loggedIn ? "1" : null;
}

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)rwa_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Called when any authenticated request comes back 401 mid-session, so the app
// can drop the stale session flag and return to the login screen.
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const csrf = csrfToken();
  if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;
  const r = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error ? j.error + (j.detail ? `: ${j.detail}` : "") : r.statusText;
    if (r.status === 401 && path !== "/api/admin/auth/login") onUnauthorized?.();
    throw new ApiError(r.status, msg);
  }
  return j as T;
}
const get = <T>(p: string) => req<T>("GET", p);
const post = <T>(p: string, b?: unknown) => req<T>("POST", p, b);
const patch = <T>(p: string, b?: unknown) => req<T>("PATCH", p, b);
const del = <T>(p: string) => req<T>("DELETE", p);

// ---- types ----
export interface Admin { id: string; email: string; role: string; name?: string | null; disabled?: boolean; created_at?: string; }
export interface Manager { id: string; name: string; company: string | null; bio: string | null; contactEmail: string | null; status: "active" | "suspended"; hasLogin: boolean; createdAt: string; }
export interface Health {
  status: string; network: string; rpc: string; db?: string;
  // null when the backend is up but can't reach the chain RPC — distinct from the
  // whole request failing, which is what "API offline" means.
  chain: { chainId: string; blockNumber: number } | null;
  rpcStatus?: "ok" | "unreachable"; signer: string;
}
export interface TokenInfo {
  address: string; name: string | null; symbol: string; decimals: number | null;
  totalSupply: string | null; paused: boolean | null; owner: string; identityRegistry: string;
}
export interface CapTable {
  token: string; symbol: string; decimals: number; totalSupply: string;
  holderCount: number; lastIndexedBlock: number;
  holders: { address: string; balance: string; percent: number }[];
}
export interface TransferRow {
  block: number; txHash: string; kind: "mint" | "burn" | "transfer"; from: string; to: string; value: string;
}
export interface AmlDeclaration {
  isPep?: boolean; pepDetails?: string | null; sourceOfFunds?: string;
  occupation?: string | null; taxResidency?: number | null;
  sanctionsDeclaration?: boolean; fundsLegitimateDeclaration?: boolean;
}
export interface Investor {
  wallet: string; onchainid: string | null; country: number | null; name: string | null;
  email: string | null; kyc_status: string; kyc_note?: string | null; kyc_rejected_at?: string | null;
  kyc_submitted_at?: string | null; verified: boolean; created_at: string;
  accreditation_status?: "none" | "accredited" | "rejected"; accreditation_note?: string | null;
  aml_status?: "unscreened" | "clear" | "review" | "blocked";
  kyc_details?: { docType?: string; addressDocType?: string; aml?: AmlDeclaration } & Record<string, unknown> | null;
}
export interface InvestorDetail {
  person: { name: string | null; email: string | null; country: number | null; createdAt: string; hasAccount: boolean };
  kyc: {
    status: string; onchainVerified: boolean; complianceApproved: boolean; note: string | null;
    submittedAt: string | null; rejectedAt: string | null; provider: string | null;
    docType: string | null; addressDocType: string | null; amlStatus: string;
    accreditationStatus: string; accreditationNote: string | null; verifiedFor: Record<string, boolean>;
  };
  identity: { onchainid: string | null; primaryWallet: string; wallets: { address: string; primary: boolean; linkedAt: string | null; amlScreening: string | null }[] };
  holdings: { symbol: string; balance: number; frozen: boolean; frozenTokens: string; stale: boolean; currency: string | null; navPerToken: number; value: number; yieldPct: number; projectedAnnual: number }[];
  earnings: { currency: string; claimed: number; claimable: number; projectedAnnual: number }[];
  timeline: { when: string; action: string; status: string; actor: string | null; detail: any; txHash: string | null }[];
}
export interface KycDocument {
  id: string; wallet: string; doc_type: string; filename: string; mime: string;
  size_bytes: number; uploaded_at: string;
}
export interface AmlScreening {
  id: string; wallet: string; person: string; provider: string; reference: string | null;
  risk_score: number; risk_level: string; sanctioned: boolean; categories: string[];
  decision: "clear" | "review" | "blocked"; screened_by: string | null; screened_at: string;
}
export interface OperationRequest {
  id: string; action: string; token_symbol: string | null; params: any;
  required_role: string; approvals_required: number; status: string;
  requested_by_email: string | null; tx_hash: string | null; error: string | null;
  case_id: string | null; created_at: string;
}
export interface AuditRow {
  id: string; actor_email: string | null; actor_role: string | null; action: string;
  target: string | null; params: any; status: string; tx_hash: string | null; created_at: string;
}
export interface SubmitResult {
  status: "pending" | "executed"; id?: string; result?: any; approvalsRequired?: number;
}
export interface LegalCase {
  id: string; reference: string; type: string; subject_wallet: string | null;
  description: string | null; document_url: string | null; status: string;
  opened_by_email: string | null; created_at: string;
  operations?: OperationRequest[]; audit?: AuditRow[];
}
export interface Issuer {
  id: string; name: string; legal_entity: string | null; contact_email: string | null;
  owner_wallet: string | null; spv_id: string | null; spv_type: string | null;
  kyb_status: string; kyb_note: string | null;
  details?: any; created_at: string;
}
export interface PropertyManagerRef {
  id: string; name: string; company: string | null; contactEmail: string | null;
  status: string; hasLogin: boolean; spvManagerId: string | null;
}
export interface SpvManager {
  id: string; name: string; company: string | null; contactEmail: string | null;
  phone: string | null; status: string; hasLogin: boolean; createdAt: string;
  managers: PropertyManagerRef[];
}
/** GET /api/admin/issuers/:id — the whole SPV, for the details panel. */
export interface IssuerDetail {
  issuer: {
    id: string; name: string; spvId: string | null; spvType: string | null;
    legalEntity: string | null; contactEmail: string | null; ownerWallet: string | null;
    kybStatus: string; kybNote: string | null; details: any; createdAt: string;
  };
  assets: { id: string; name: string; tokenSymbol: string | null; status: string; location: string | null; managerId: string | null }[];
  spvManagers: SpvManager[];
  unassignedManagers: PropertyManagerRef[];
}
export interface Subscription {
  id: string; reference: string; wallet: string; offeringId: string; tokenSymbol: string;
  amountFiat: string; currency: string; tokens: number; status: string;
  paymentProvider: string; txHash: string | null; createdAt: string;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    post<{ token: string; admin: Admin }>("/api/admin/auth/login", { email, password }),
  logout: () => post("/api/admin/auth/logout", {}),
  me: () => get<{ admin: Admin }>("/api/admin/auth/me"),
  // team / sub-admin management (issuer_admin only)
  admins: () => get<Admin[]>("/api/admin/team"),
  createAdmin: (b: { email: string; password: string; role: string; name?: string }) =>
    post<Admin>("/api/admin/team", b),
  updateAdmin: (id: string, b: { disabled?: boolean; role?: string }) =>
    patch<Admin>(`/api/admin/team/${id}`, b),
  // reads
  health: () => get<Health>("/health"),
  config: () => get<{ network: string; chainId: number; explorerUrl: string }>("/api/config"),
  tokens: () => get<TokenInfo[]>("/api/admin/tokens"),
  capTable: (s: string) => get<CapTable>(`/api/admin/tokens/${s}/cap-table`),
  transfers: (s: string) => get<TransferRow[]>(`/api/admin/tokens/${s}/transfers?limit=25`),
  investors: () => get<Investor[]>("/api/admin/investors"),
  investorDetail: (wallet: string) => get<InvestorDetail>(`/api/admin/investors/${wallet}`),
  audit: () => get<AuditRow[]>("/api/admin/audit?limit=60"),
  operations: (status?: string) =>
    get<OperationRequest[]>(`/api/admin/operations${status ? `?status=${status}` : ""}`),
  subscriptions: () =>
    get<{ items: Subscription[] }>("/api/admin/subscriptions").then((r) => r.items),
  offerings: () => get<any[]>("/api/admin/offerings"),
  offeringDetail: (id: string) => get<any>(`/api/admin/offerings/${id}`),
  uploadImage: (dataUrl: string) => post<{ url: string }>("/api/uploads", { dataUrl }),
  updateOffering: (id: string, b: any) => patch<any>(`/api/admin/offerings/${id}`, b),
  deployTokenForOffering: (id: string, b: { issuerId: string; symbol: string; maxHolders?: number; lockupDays?: number }) =>
    post<any>(`/api/admin/offerings/${id}/deploy-token`, b),
  recordValuation: (id: string, totalValue: number, note?: string) =>
    post<any>(`/api/admin/offerings/${id}/valuations`, { totalValue, note }),
  valuations: (id: string) => get<any[]>(`/api/admin/offerings/${id}/valuations`),
  // property managers
  managers: () => get<Manager[]>("/api/admin/managers"),
  createManager: (b: { name: string; company?: string; bio?: string; contactEmail?: string; loginEmail?: string; loginPassword?: string }) =>
    post<Manager>("/api/admin/managers", b),
  updateManager: (id: string, b: { status?: string; name?: string; company?: string; bio?: string; contactEmail?: string }) =>
    patch<Manager>(`/api/admin/managers/${id}`, b),
  assignManager: (offeringId: string, managerId: string | null) =>
    post(`/api/admin/offerings/${offeringId}/manager`, { managerId }),
  openBuyback: (offeringId: string, b: { sellerWallet?: string; pricePerToken: number; maxTokens?: number | null }) =>
    post(`/api/admin/offerings/${offeringId}/buyback`, b),
  closeBuyback: (offeringId: string) => del(`/api/admin/offerings/${offeringId}/buyback`),
  proposals: (offeringId: string) => get<any[]>(`/api/admin/offerings/${offeringId}/proposals`),
  createProposal: (offeringId: string, b: { proposedManagerId: string; reason?: string; closesAt: string }) =>
    post(`/api/admin/offerings/${offeringId}/proposals`, b),
  closeProposal: (proposalId: string) => post(`/api/admin/proposals/${proposalId}/close`, {}),
  myProperties: () => get<any[]>("/api/admin/managers/me/offerings"),
  propertyUpdates: (offeringId: string) => get<any[]>(`/api/admin/offerings/${offeringId}/updates`),
  postPropertyUpdate: (offeringId: string, b: { title: string; body: string }) =>
    post(`/api/admin/offerings/${offeringId}/updates`, b),
  // issuers (SPV onboarding + asset creation)
  issuers: () => get<Issuer[]>("/api/admin/issuers"),
  registerIssuer: (b: any) => post<Issuer>("/api/admin/issuers", b),
  updateIssuer: (id: string, b: any) => patch<Issuer>(`/api/admin/issuers/${id}`, b),
  approveKyb: (id: string, ownerWallet?: string) => post(`/api/admin/issuers/${id}/approve-kyb`, { ownerWallet }),
  rejectKyb: (id: string, note: string) => post(`/api/admin/issuers/${id}/reject-kyb`, { note }),
  createAsset: (id: string, b: any) => post(`/api/admin/issuers/${id}/assets`, b),
  issuerDetail: (id: string) => get<IssuerDetail>(`/api/admin/issuers/${id}`),
  spvTypes: () => get<{ types: string[] }>("/api/admin/issuers/spv-types"),
  // SPV managers (oversee an SPV's property managers)
  addSpvManager: (issuerId: string, b: any) => post<SpvManager>(`/api/admin/issuers/${issuerId}/spv-managers`, b),
  updateSpvManager: (smId: string, b: any) => patch<SpvManager>(`/api/admin/spv-managers/${smId}`, b),
  addPropertyManagerUnder: (smId: string, b: any) => post(`/api/admin/spv-managers/${smId}/managers`, b),
  assignPropertyManager: (smId: string, managerId: string, attach: boolean) =>
    post(`/api/admin/spv-managers/${smId}/managers/${managerId}`, { attach }),
  // legal cases (court orders)
  cases: () => get<LegalCase[]>("/api/admin/cases"),
  openCase: (b: any) => post<LegalCase>("/api/admin/cases", b),
  caseDetail: (id: string) => get<LegalCase>(`/api/admin/cases/${id}`),
  closeCase: (id: string) => post(`/api/admin/cases/${id}/close`, {}),
  recover: (id: string, b: any) => post(`/api/admin/cases/${id}/recover`, b),
  // investor lifecycle (admin side)
  onboard: (b: any) => post("/api/admin/onboarding/prepare", b),
  pendingKyc: () => get<Investor[]>("/api/admin/kyc/pending"),
  approveKyc: (wallet: string, b: any) => post(`/api/admin/kyc/${wallet}/approve`, b),
  rejectKyc: (wallet: string, note: string) => post(`/api/admin/kyc/${wallet}/reject`, { note }),
  startVerifyingKyc: (wallet: string) => post(`/api/admin/kyc/${wallet}/start-verifying`, {}),
  amlHistory: (wallet: string) => get<AmlScreening[]>(`/api/admin/aml/${wallet}`),
  amlRescreen: (wallet: string) => post<{ amlStatus: string }>(`/api/admin/aml/${wallet}/rescreen`, {}),
  kycDocuments: (wallet: string) => get<KycDocument[]>(`/api/admin/kyc/${wallet}/documents`),
  // The document bytes are served inline behind the auth cookie; fetch as a blob
  // (cross-origin needs credentials) and hand back an object URL the UI can open.
  kycDocumentBlobUrl: async (id: string) => {
    const r = await fetch(`${BASE}/api/kyc-documents/${id}`, { credentials: "include" });
    if (!r.ok) throw new ApiError(r.status, `Could not load document (${r.status})`);
    return URL.createObjectURL(await r.blob());
  },
  approveAccreditation: (wallet: string, note?: string) =>
    post<{ accreditationStatus: string; onchain: string }>(`/api/admin/accreditation/${wallet}/approve`, { note }),
  rejectAccreditation: (wallet: string, note: string) =>
    post<{ accreditationStatus: string; onchain: string }>(`/api/admin/accreditation/${wallet}/reject`, { note }),
  revokeClaim: (wallet: string) => post(`/api/admin/investors/${wallet}/revoke-claim`),
  // token operations (mint/burn/force-transfer/pause may return pending or executed)
  mint: (s: string, b: any) => post<SubmitResult>(`/api/admin/tokens/${s}/mint`, b),
  burn: (s: string, b: any) => post<SubmitResult>(`/api/admin/tokens/${s}/burn`, b),
  forceTransfer: (s: string, b: any) => post<SubmitResult>(`/api/admin/tokens/${s}/force-transfer`, b),
  pause: (s: string, paused: boolean) => post<SubmitResult>(`/api/admin/tokens/${s}/pause`, { paused }),
  freeze: (s: string, wallet: string, frozen: boolean) =>
    post(`/api/admin/tokens/${s}/freeze`, { wallet, frozen }),
  distribute: (s: string, amount: string, note: string) =>
    post<any>(`/api/admin/tokens/${s}/distributions`, { amount, note }),
  // approvals
  approveOp: (id: string, note?: string) => post(`/api/admin/operations/${id}/approve`, { note }),
  rejectOp: (id: string, note?: string) => post(`/api/admin/operations/${id}/reject`, { note }),
};
