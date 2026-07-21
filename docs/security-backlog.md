# Security backlog — BDN Comunicação

Pending security work, ordered by priority. Each item says **what's wrong**, **where**, **how to fix it**, and **how to verify the fix**.

Written 2026-07-20, after the session that added password hashing and JWT sessions.
Updated 2026-07-20 (same day): items 2, 4, 6, 7, 8, 9.4, 10 and 11 are now implemented — see below.
Updated 2026-07-21: item 5 is implemented — the session moved to an `HttpOnly` cookie.

## Already done (context, no action needed)

- **Passwords are hashed** — scrypt (`node:crypto`), salt per password, `timingSafeEqual` comparison. See [`server/password.ts`](../server/password.ts). Old plaintext records still authenticate and are silently upgraded to a hash on the user's next login.
- **Real token sessions** — signed JWT (HS256, 12h, issuer pinned) in `Authorization: Bearer`. See [`server/tokens.ts`](../server/tokens.ts). The old `x-user-id` header, which let anyone impersonate any user, is gone.
- **Stateless revocation** — each token embeds a fingerprint of the current password hash, so changing a password invalidates every token issued before it, on all devices. Deleting a user kills their tokens too.
- **`JWT_SECRET` is mandatory in production** — the server refuses to boot without a secret of at least 32 chars. Wired through Terraform as the sensitive `jwt_secret` variable.

### Landed in the follow-up session

- **Request/subtask/comment routes require login** (item 2) — writes are all behind `requireUser`; only the public form, the tracking lookup and the two tracking `GET`s stay open. Comment authorship now comes from the session.
- **Login rate limiting** (item 4) — per-IP and per-account limiters, counting only failed attempts. `trust proxy` set on both the dev server *and* the Lambda.
- **Password policy** (item 6, partial) — 10-character floor plus a small blocklist, shared by the API and both UI forms. Reset flow and `mustChangePassword` still pending.
- **`/api/users` trimmed for non-admins** (item 7).
- **Dev seed passwords out of the source** (item 8) — `DEV_SEED_PASSWORD` or a random one printed at startup.
- **Response bodies no longer logged** (item 9.4) — the old logger wrote the login response, token included, to CloudWatch.
- **CORS no longer wildcard** (item 10) — defaults to `[]`, since the app is same-origin through CloudFront.
- **Security headers** (item 11) — `helmet` on both entry points, CSP still off pending tuning.
- **Session in an `HttpOnly` cookie** (item 5) — the token is out of `localStorage` and out of JavaScript's reach.

---

## 1. Admin password `bdn2026` is committed to the repository

**Status: repo side done — ⚠️ ACTION STILL REQUIRED FROM YOU.** `user-admin.json` is untracked and gitignored, and [`user-admin.example.json`](../user-admin.example.json) holds the recipe with a `CHANGE_ME` placeholder. **Rotating the production password is still on you and nothing else here substitutes for it** — the value is in the git history, so `bdn2026` must be assumed compromised until changed. Log in as `admin` → `/usuarios` → "Alterar senha" (the new policy will require 10+ chars and rejects `bdn2026` outright).

**Severity: critical — assume this credential is already compromised.**

**Where:** [`user-admin.json`](../user-admin.json) at the repo root, tracked in git. It is the DynamoDB `put-item` payload used to seed the production admin, and it contains `"password": {"S": "bdn2026"}` in plaintext. The same password also appears in the dev seed in [`server/storage.ts`](../server/storage.ts).

**Why it matters:** anyone with repository access — now or in the entire git history — has the production administrator password. Admin can create users, grant admin rights, delete accounts, and read the whole team's contact data.

**Fix:**

1. **Change the production password first**, before touching the repo. Log in as `admin` and use `/usuarios` → "Alterar senha". Every existing admin token dies automatically as a result. Use a long, unique password from a password manager.
2. Remove the file from the working tree and ignore it:
   ```bash
   git rm --cached user-admin.json
   echo "user-admin.json" >> .gitignore
   git commit -m "chore: remove seeded admin credential from repo"
   ```
3. If you want the seeding recipe kept, replace it with `user-admin.example.json` carrying a placeholder (`"CHANGE_ME"`) and a note that the real value must never be committed. Note that the seed only works for a *fresh* user — a plaintext password written straight into DynamoDB will be upgraded to a hash on first login, which is fine, but prefer creating users through the app.
4. Purging the value from git history (`git filter-repo`, or a fresh repo) is only worth it if the remote is shared or public. Rotating the password is what actually protects you; history rewriting is cleanup.
5. Do the same for the dev seed passwords in [`server/storage.ts`](../server/storage.ts) — see item 8.

**Verify:** `git ls-files | grep user-admin` returns nothing, and logging in with `bdn2026` fails.

---

## 2. Request, subtask, and comment endpoints have no authentication at all

**Status: done.** The *simplest* option was taken: every write is behind `requireUser`, and `GET /api/requests/:id/subtasks` and `.../comments` stay public so the tracking page keeps working without a login. `PATCH /api/requests/:id/status` is `requireUser` (not `requireAdmin`) — the whole team moves requests along, and the misleading "admin only" comment was corrected. `POST .../comments` now takes `authorName` from the session, so the body can no longer claim to be someone else.

**Left open:** anyone with a request ID still reads that request's task list and internal comments. That is the accepted tradeoff of this option, and it makes **item 3 the thing that actually contains the exposure** — until IDs stop being guessable, "you need the ID" is a weak barrier.

**Severity: critical.**

**Where:** [`server/routes.ts`](../server/routes.ts) — every route in the "Requests", "Subtasks", and "Comments" sections is registered without `requireUser`/`requireAdmin`:

| Route | Current | Problem |
|---|---|---|
| `GET /api/requests` | public | anyone on the internet can dump every request the ministry ever received |
| `PATCH /api/requests/:id/status` | public | comment says "admin only" but **no middleware is applied** — anyone can change any request's status |
| `GET /api/requests/:id` | public | intentional (public tracking page), keep |
| `POST /api/requests` | public | intentional (public request form), keep |
| `GET/POST /api/requests/:id/subtasks` | public | internal task list readable and writable by anyone |
| `PATCH /api/subtasks/:id/toggle` | public | anyone can tick/untick tasks |
| `DELETE /api/subtasks/:id` | public | **anyone can delete internal tasks** |
| `GET/POST /api/requests/:id/comments` | public | internal notes readable and postable by anyone |

The auth work done so far protected `/api/users`, `/api/schedules`, and `/api/unavailability`, but these were left as they were.

**Why it matters:** this is a bigger practical exposure than anything in the login flow — no credentials are needed to reach it, and it includes destructive operations (`DELETE`, status changes).

**Fix:** add the middleware, keeping only the two genuinely public routes public.

```ts
// keep public: the request form and the tracking page
app.post("/api/requests", ...)            // unchanged
app.get("/api/requests/:id", ...)         // unchanged (consider item 3 below)

// require login
app.get("/api/requests", requireUser, ...)
app.patch("/api/requests/:id/status", requireUser, ...)
app.get("/api/requests/:id/subtasks", requireUser, ...)
app.post("/api/requests/:id/subtasks", requireUser, ...)
app.patch("/api/subtasks/:id/toggle", requireUser, ...)
app.delete("/api/subtasks/:id", requireUser, ...)
app.get("/api/requests/:id/comments", requireUser, ...)
app.post("/api/requests/:id/comments", requireUser, ...)
```

Two follow-ups while you're in there:

- `POST /api/requests/:id/comments` takes `authorName` from the request body. Once the route requires a login, take it from `(req as AuthedRequest).authUser!.displayName` instead so people can't post as someone else.
- Decide whether `PATCH /api/requests/:id/status` should be `requireAdmin`. The comment says admin-only; if the whole team is meant to move requests along, fix the comment instead.

**Careful — this will break the public tracking page if applied blindly.** [`client/src/pages/tracking.tsx`](../client/src/pages/tracking.tsx) (lines 41-63) fetches three endpoints without being logged in:

- `GET /api/requests/:id` — fine, stays public
- `GET /api/requests/:id/subtasks` — **would 401**
- `GET /api/requests/:id/comments` — **would 401**

So decide what the requester is meant to see. Two workable options:

- *Simplest:* keep those two `GET`s public and protect only the write routes (`POST` subtasks, `PATCH toggle`, `DELETE`, `POST` comments) plus `GET /api/requests`. Accept that anyone with a request ID reads its task list and comments — combine with item 3 so IDs aren't guessable.
- *Stricter:* protect all of them and give the tracking page a reduced public view (status and dates only, no internal notes). Better privacy — internal comments are staff conversation, and the requester probably shouldn't see all of it either.

Note the second option is also a privacy fix in its own right: today the public page exposes internal subtasks and comments to anyone who has (or guesses) a request ID.

**Verify:** with no `Authorization` header, each protected route returns 401; the public form and tracking page still work end to end in the browser.

---

## 3. Request tracking IDs are guessable

**Status: not done — and its priority went UP.** Item 2 was resolved by leaving the subtask and comment `GET`s public, so a guessed ID now yields the request *plus* its internal task list and staff comments. Treat this as the next piece of work.

**Severity: medium → high, given how item 2 was resolved.**

**Where:** `GET /api/requests/:id` is public by design (tracking), and IDs come from `generateRequestId()` in [`server/storage-dynamo.ts`](../server/storage-dynamo.ts) — timestamp-derived and sequential-ish.

**Why it matters:** someone can enumerate IDs and read other ministries' requests: event names, dates, descriptions, requester names.

**Fix:** give each request an unguessable tracking token (`randomBytes(16).toString("hex")`) at creation, return it to the requester, and make the public lookup `GET /api/requests/track/:token`. Keep the numeric-ID route for logged-in staff behind `requireUser`. Update the tracking page and whatever link/message is sent to the requester.

**Verify:** `GET /api/requests/1001` without a token returns 401; the tracking link with the token works.

---

## 4. Login has no rate limiting

**Status: done, with one deliberate change from the plan below.** Both limiters set `skipSuccessfulRequests: true`, so only *failed* attempts count. Without it, a team sharing one wi-fi (one IP after NAT) would lock itself out on a Sunday morning — a successful login by one volunteer was consuming another's quota. This costs nothing against brute force, where every guess is a failure. The per-IP limit is 30/15min, the per-account limit is 10/15min, and a broad 600/15min limiter sits on `/api`. `trust proxy` is set in [`server/index.ts`](../server/index.ts) **and** [`server/lambda.ts`](../server/lambda.ts) — the Lambda builds its own Express app and does not go through `index.ts`, so production would otherwise have missed it.

Verified: the 11th wrong password for one account returns 429 while other accounts on the same IP still log in.

**Severity: high.**

**Where:** `app.post("/api/auth/login", ...)` in [`server/routes.ts`](../server/routes.ts).

**Why it matters:** unlimited password guesses at full speed. Also a cheap denial-of-wallet vector — every attempt runs a scrypt hash (~70ms of Lambda compute), so an attacker can burn your budget with a loop.

**Fix:** `express-rate-limit` is already in the esbuild bundle allowlist in [`script/build.ts`](../script/build.ts), so it will be bundled once installed.

```bash
npm install express-rate-limit
```

```ts
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,                     // per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

app.post("/api/auth/login", loginLimiter, async (req, res) => { ... });
```

Behind API Gateway/CloudFront, `req.ip` is the proxy address unless Express trusts the forwarding header — set `app.set("trust proxy", 1)` in [`server/index.ts`](../server/index.ts), otherwise the limit applies globally to all users at once (which fails closed but locks out the whole church).

Consider a second limiter keyed on `username` so one account can't be attacked from many IPs, and a global limiter on `/api` for the denial-of-wallet angle.

**Verify:** 11 failed logins in a row from the same IP → the 11th returns 429; a correct login from a different IP still works.

---

## 5. The session token lives in `localStorage`, readable by any XSS

**Status: done.** The JWT now travels in an `HttpOnly` cookie (`bdn_session`, `SameSite=Strict`, `Path=/`, 12h `Max-Age`, `Secure` only in production — dev runs on `http://localhost`, where `Secure` would stop the cookie being stored). It is no longer returned in the login body at all, so the client physically cannot store it again. `cookie-parser` is registered in [`server/index.ts`](../server/index.ts) **and** [`server/lambda.ts`](../server/lambda.ts) (the Lambda builds its own app), and added to the esbuild allowlist in [`script/build.ts`](../script/build.ts) — verified it lands inside `dist/lambda.js` rather than as an external `require`.

On the client, [`client/src/lib/auth.ts`](../client/src/lib/auth.ts) keeps only the user object (display data — name, roles, admin flag; it grants nothing, the cookie is what the server checks) under a new key `bdn-auth-user-v2`, and deletes the old `bdn-auth-session`/`bdn-auth-user` keys on first load so no stale token sits in `localStorage`. Every fetch in [`client/src/lib/queryClient.ts`](../client/src/lib/queryClient.ts) sends `credentials: "include"`. Logout now calls `POST /api/auth/logout` (which `clearCookie`s) before dropping local state — previously it was purely client-side, which is no longer enough.

`resolveRequestUser` reads the cookie first and **still accepts `Authorization: Bearer` as a fallback**, so a tab left open on the old client keeps working. Remove that fallback once everyone has logged in again — it's the last path by which a script-readable token would be accepted.

Verified end to end against the dev server: login returns `Set-Cookie: bdn_session=…; HttpOnly; SameSite=Strict` and a body with no `token`; `/api/auth/me` is 200 with the cookie and 401 without; logout expires the cookie and the next call is 401; a password change re-issues the cookie and 401s the previous one.

**Infra:** no CloudFront change was needed — the `/api/*` behavior already forwards `cookies { forward = "all" }` and caches nothing. [`infra/api_gateway.tf`](../infra/api_gateway.tf) now sets `allow_credentials = length(var.cors_allowed_origins) > 0`, so cookies would survive if anyone ever points a cross-origin client at API Gateway; with the default empty list the app stays same-origin and CORS is not involved.

**Still open:** no CSRF token. `SameSite=Strict` is what carries the defense today — a cross-site request simply doesn't get the cookie. A double-submit token would be belt and braces, and matters more if the cookie ever relaxes to `Lax`/`None`. The CSP in item 11 is the other half of this: it's what limits the XSS in the first place.

**Severity: medium (design tradeoff, not a bug).**

**Where:** [`client/src/lib/auth.ts`](../client/src/lib/auth.ts) persists `{token, user}` under `bdn-auth-session`.

**Why it matters:** any script injected into the page (a compromised npm dependency, a bad CDN, a stored-XSS hole) can read the token and use it until it expires. An `HttpOnly` cookie cannot be read by JavaScript at all.

**Fix (a moderate refactor — do it deliberately):**

1. Server: on login, `res.cookie("session", token, { httpOnly: true, secure: true, sameSite: "strict", maxAge: 12*3600*1000, path: "/" })` and stop returning the token in the body.
2. Server: in `resolveRequestUser`, read `req.cookies.session` (add `cookie-parser`) with the `Authorization` header as a fallback during migration.
3. Client: drop token storage entirely, send `credentials: "include"` on every fetch in [`client/src/lib/queryClient.ts`](../client/src/lib/queryClient.ts), and keep only the non-sensitive user object in memory/localStorage for UI.
4. `POST /api/auth/logout` must clear the cookie (`res.clearCookie`).
5. **CSRF becomes relevant** once the browser sends credentials automatically. `SameSite=Strict` covers most of it; add a double-submit CSRF token for state-changing routes if you want belt and braces.
6. Check the CloudFront/API Gateway setup forwards cookies to the Lambda — see [`infra/api_gateway.tf`](../infra/api_gateway.tf) and [`infra/cloudfront.tf`](../infra/cloudfront.tf).

If you skip this, at minimum keep the token TTL short and make sure no third-party scripts are loaded by the app.

**Verify:** after login, `document.cookie` in the browser console does **not** show the session, and the app still works across a page reload.

---

## 6. Weak password policy, no reset flow

**Status: steps 1-3 done, steps 4-5 still open.** `passwordIssue()` in [`shared/schema.ts`](../shared/schema.ts) enforces a 10-character floor plus a blocklist (`bdn2026`, `123456…`, church name, the username itself) and is applied to `changePasswordSchema` **and** `adminCreateUserSchema`, plus mirrored in both UI forms so the error shows before submitting.

**Still to do:** step 4 (`mustChangePassword` on admin-created accounts) and step 5 (self-service e-mail reset).

**Severity: medium.**

**Where:** `changePasswordSchema` in [`shared/schema.ts`](../shared/schema.ts) requires 6 characters; `adminCreateUserSchema` sets no minimum at all.

**Why it matters:** `123456` is a valid password today. And there is no self-service recovery — a forgotten password requires an admin, who currently just sets a new one and tells the person, which means the admin knows their password.

**Fix:**

1. Raise the floor to 10-12 characters in `changePasswordSchema` **and** add the same rule to user creation. Prefer length over character-class rules.
2. Block obvious values (a small list: `bdn2026`, `123456789`, the username itself, the church name). A short in-repo array is enough at this scale.
3. Mirror the rule in the UI so the error appears before submitting — [`client/src/pages/usuarios.tsx`](../client/src/pages/usuarios.tsx) (`PasswordForm`) and the create form in [`client/src/pages/equipes.tsx`](../client/src/pages/equipes.tsx).
4. Force a change on first login: add a `mustChangePassword` flag set when an admin creates or resets an account, and have the client route to `/usuarios` until it's cleared.
5. Self-service reset by e-mail is now feasible since `/usuarios` collects addresses: single-use token, 30-minute expiry, stored hashed. Needs an e-mail sender (SES fits the AWS stack). This is the largest piece — treat it as its own task.

**Verify:** a 6-character password is rejected by both the API and the UI; a newly created user is sent to the password page on first login.

---

## 7. Every logged-in user can read the whole team's contact details

**Status: done** exactly as sketched below. Verified: a volunteer token gets `id, username, displayName, isAdmin, roles`; an admin token still gets `email`/`phone`/`cellName`/`cellLeaders`. `/usuarios` was unaffected (it reads the user's own record from `/api/auth/me`) and `/equipes` is admin-only.

**Severity: medium (privacy).**

**Where:** `GET /api/users` in [`server/routes.ts`](../server/routes.ts) is `requireUser` and returns the full record for everyone, now including `email`, `phone`, `cellName`, and `cellLeaders`.

**Why it matters:** the escalas UI only needs id, name, and roles. Any volunteer can currently pull the personal phone numbers and e-mails of the whole team — data they gave you for their own profile, not for the address book.

**Fix:** branch on `authUser.isAdmin`:

```ts
app.get("/api/users", requireUser, async (req, res) => {
  const user = (req as AuthedRequest).authUser!;
  const users = await storage.getAllUsers();
  if (user.isAdmin) {
    return res.json(users.map(({ password, ...rest }) => rest));
  }
  return res.json(users.map((u) => ({
    id: u.id, username: u.username, displayName: u.displayName, isAdmin: u.isAdmin, roles: u.roles,
  })));
});
```

The `/equipes` page (admin-only) keeps showing contact info; the escalas components consume only the trimmed fields, so they're unaffected — confirm against [`client/src/components/escalas/`](../client/src/components/escalas/).

**Verify:** a non-admin token gets a payload with no `email`/`phone`; an admin token still sees them; `/escalas` works with both.

---

## 8. Dev seed credentials live in the source

**Status: done.** All six seed users share `DEV_SEED_PASSWORD`, or a `randomBytes(12)` value printed once at startup. The `MemStorage` constructor also throws outright if `NODE_ENV === "production"`, so a misconfigured deploy fails loudly instead of quietly standing up seeded accounts.

**Severity: low (dev-only, but poor hygiene).**

**Where:** the `MemStorage` constructor in [`server/storage.ts`](../server/storage.ts) — `admin`/`bdn2026`, `lucas`/`lucas2026`, and four more.

**Why it matters:** they're real passwords in version control, and they'd become real accounts if `MemStorage` were ever selected in production (it's chosen by `NODE_ENV`, so a misconfigured deploy is all it takes).

**Fix:** read them from env vars with a random fallback:

```ts
const seedPassword = process.env.DEV_SEED_PASSWORD ?? randomBytes(12).toString("hex");
```

Log the generated password once at startup in dev so you can still log in. Keep the seed strictly behind `NODE_ENV !== "production"`.

**Verify:** `grep -rn "bdn2026" server/ client/ shared/` returns nothing.

---

## 9. No audit trail, no account lockout

**Status: step 4 done, steps 1-3 still open.** The request logger was writing every response body to CloudWatch — including the login response, session token and all, and the whole team's e-mails and phone numbers on `/api/users`. It now logs method, path, status and duration only. Request bodies were never logged, so the login password was not exposed.

**Still to do:** the `audit` table (steps 1-2) and account lockout (step 3). Note that item 4's per-account rate limit now covers part of what lockout was for.

**Severity: medium.**

**Why it matters:** nothing records who logged in, who failed to, who promoted whom to admin, or who deleted an account. After an incident you cannot answer "what happened". Related: an attacker can keep guessing one account's password forever (rate limiting in item 4 slows this but doesn't stop a slow, distributed attempt).

**Fix:**

1. Add an append-only `audit` table (Terraform: copy the pattern in [`infra/dynamodb.tf`](../infra/dynamodb.tf)) with `id`, `at`, `actorId`, `action`, `targetId`, `ip`.
2. Write an entry on: login success, login failure, password change, user create/delete, admin grant/revoke.
3. Add `failedLoginCount` and `lockedUntil` to the user record; lock for 15 minutes after ~8 consecutive failures and reset the counter on success.
4. Never log passwords or tokens. Confirm the request logger in [`server/index.ts`](../server/index.ts) doesn't dump request bodies to CloudWatch — check before deploying, since the login body contains a password.

**Verify:** a failed login writes an audit row; 8 failures lock the account; the log output contains no password.

---

## 10. CORS allows every origin

**Status: done, resolved differently than proposed below.** The client calls `/api` with relative URLs through CloudFront, which proxies to API Gateway — so the app is **same-origin and needs no CORS at all**. Rather than naming the CloudFront domain (which this same Terraform config creates, a chicken-and-egg on first apply), `cors_allowed_origins` now defaults to `[]` and a `validation` block rejects `"*"`. Only fill it in if something starts calling API Gateway directly.

**Severity: low-medium.**

**Where:** [`infra/variables.tf`](../infra/variables.tf) — `cors_allowed_origins` defaults to `["*"]`, consumed by [`infra/api_gateway.tf`](../infra/api_gateway.tf).

**Fix:** set it to the CloudFront domain (and any custom domain) in your tfvars. `allow_headers` already includes `Authorization`, so the Bearer flow keeps working. If you move to cookies (item 5), you also need `allow_credentials = true`, and the wildcard becomes invalid — browsers reject `*` with credentials.

**Verify:** a `fetch` from an unrelated origin is blocked by the browser; the app's own origin works.

---

## 11. No security headers

**Status: done, minus the CSP.** `helmet({ contentSecurityPolicy: false })` is applied in both [`server/index.ts`](../server/index.ts) and [`server/lambda.ts`](../server/lambda.ts), and `helmet` was added to the bundle allowlist in [`script/build.ts`](../script/build.ts) (verified: it lands inside `dist/lambda.js`, not as an external require). Confirmed live: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `X-DNS-Prefetch-Control`.

**Still to do:** the CSP itself, which is the header that would actually limit the damage of item 5. It needs tuning against the Vite production build.

**Severity: low-medium.**

**Where:** [`server/index.ts`](../server/index.ts) sets none.

**Fix:** `npm install helmet` and `app.use(helmet())` before the routes. The valuable ones here are `Content-Security-Policy` (limits the damage of item 5), `Strict-Transport-Security`, `X-Content-Type-Options`, and `Referrer-Policy`. A CSP takes tuning against the Vite build — start with `helmet({ contentSecurityPolicy: false })`, add the CSP separately, and test the built app, not just dev. `helmet` is not in the bundle allowlist in [`script/build.ts`](../script/build.ts) — add it there or it stays external to the Lambda ZIP.

**Verify:** `curl -I` against the deployed app shows the headers; the app still renders (no CSP violations in the console).

---

## 12. Dependency vulnerabilities

**Status: not done.**

**Severity: unknown until reviewed.**

`npm install` currently reports 14 vulnerabilities (3 low, 4 moderate, 7 high). Run `npm audit`, and judge each one by whether it's reachable from your code — many will be in build-time tooling, which matters far less than a runtime dependency. Fix with `npm audit fix`; treat `--force` with care, as it introduces breaking changes. Worth repeating before each deploy.

---

## 13. Smaller items

- **Token TTL is 12h with no refresh** — a volunteer mid-task gets logged out. If that's annoying in practice, add a sliding refresh (reissue when the token is past half its life) rather than simply extending the TTL.
- **`JWT_SECRET` rotation** invalidates every session at once. Acceptable at this size; if you want zero-downtime rotation, accept two secrets during a transition window.
- **Admins can set other people's passwords** through user creation, and there's no "reset" endpoint — decide deliberately whether admins should be able to reset (with a forced change on next login, per item 6) or whether recovery must go through e-mail only.
- **`GET /api/users/me` and `GET /api/auth/me` are duplicates** — harmless, but collapse them when convenient.
- **No account for shared logins** — if `comunicacao` is a shared account, individual audit trails (item 9) become meaningless for it. Prefer one account per person.
