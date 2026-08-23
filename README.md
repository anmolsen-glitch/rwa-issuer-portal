# RWA Token Frontend — Admin Console

A dark, dashboard-style admin console for the ERC-3643 RWA platform. Talks to the
authenticated, multi-asset backend in `../rwa-token-backend`.

Vite + React + TypeScript, plain CSS. Admin **login (JWT)**, a **token selector**
(multi-asset), the **four-eyes approval queue**, and an **audit log**.

## Run it

```bash
# 1: local chain
cd ../rwa-token-production && npm run node
# 2: deploy contracts
cd ../rwa-token-production && npm run deploy:all
# 3: Postgres + backend API
cd ../rwa-token-backend && docker compose up -d && npm install && npm run db:migrate && npm run dev
# 4: this console
cd rwa-token-frontend && npm install && npm run dev
```

Open the printed URL (default http://localhost:5173) and sign in with the seeded
admin (`admin@example.com` / `changeme123` by default — change it). If your API
isn't on `localhost:4000`, set `VITE_API_URL` in a `.env` file.

## Seeded sign-in credentials (dev only)

The superuser (`admin@example.com`) is created automatically on first backend boot.
The per-role accounts below are created by the demo seed — run it once against the
backend:

```bash
cd ../rwa-token-backend && npm run db:seed
```

| Email                    | Password      | Role           | Can do                                             |
| ------------------------ | ------------- | -------------- | -------------------------------------------------- |
| `admin@example.com`      | `changeme123` | `issuer_admin` | Superuser — issuers/assets, pause, offerings, team |
| `agent@demo.local`       | `demodemo12`  | `agent`        | Token ops (mint / burn / force-transfer / freeze)  |
| `agent2@demo.local`      | `demodemo12`  | `agent`        | Second agent — the checker for four-eyes actions   |
| `compliance@demo.local`  | `demodemo12`  | `compliance`   | Onboarding / KYC review                            |

Two `agent` accounts exist on purpose: force-transfer needs **two** approvals, so a
distinct approver has to be available besides the requester. All of these are
insecure demo defaults — never seed them into a real deployment.

Two more roles exist but have **no seeded login**: `manager` (a property-manager
portal login, created ad-hoc when you add a manager with credentials under
*Managers*) and `spv_manager` (profile-only today — see *Issuers → View details*).

## What's on screen

- **Login** — email/password → admin JWT (stored in localStorage).
- **Token selector** (header) — switch between deployed assets; every view is
  scoped to the selected token.
- **Overview** — supply / holders / trading status / **pending-approvals** tiles,
  plus quick **Mint** and **Onboard** cards and a cap-table preview.
- **Cap Table** — every holder with a % bar, plus the live transfer feed.
- **Investors** — custodial onboard (dev), **Approve KYC** (enables non-custodial
  self-onboarding), the investor list, and **Revoke KYC**.
- **Operations** — Mint / Burn / Force-transfer / Pause (these go through the
  **approval queue** → submitting shows "request #N") and immediate **Freeze**.
- **Approvals** — the pending four-eyes queue with **Approve / Reject**, plus
  recently decided requests. You can't approve a request you submitted, and the
  approver must hold the action's role.
- **Orders** — payment reconciliation: every investment order with its status
  (`pending_payment` → `settled`), fiat amount, minted tokens, and tx hash.
- **Audit Log** — every privileged action with actor, status, and tx hash.

## Notes

- Roles gate what you can do (the API enforces it; the UI surfaces the errors):
  `issuer_admin` (superuser + pause + offerings), `compliance` (onboarding/KYC),
  `agent` (token ops), `manager` (scoped property-manager portal), `spv_manager`
  (oversees an SPV's property managers). Approving a request needs the action's role.
- Sensitive actions return `202 pending` until a second admin approves them
  (set `APPROVAL_THRESHOLD=0` on the backend to disable four-eyes for solo dev).
