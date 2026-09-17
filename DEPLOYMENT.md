# 1. Anything I could not perform myself

- Push these changes to GitHub `main`: this workspace has no Git metadata or remote, and the GitHub CLI is not installed.
- Create or connect the provider projects: the Vercel and Railway CLIs are not installed. In Vercel, import the GitHub repository from `main`, set the Root Directory to `frontend`, and deploy to its temporary `vercel.app` URL first. In Railway, import the same repository from `main`, set the Root Directory to `app`, keep one replica because voice signaling is held in process memory, set the health-check path to `/api/health`, and deploy to its temporary `up.railway.app` URL first.
- Add the custom domains after both temporary URLs pass the checklist: `leetbrofinder.rmkrv.com` in Vercel and `api.leetbrofinder.rmkrv.com` in Railway.
- Guarantee voice connectivity on every network: the current WebRTC implementation uses a public STUN server without a TURN relay. Test it across two real networks; restrictive NATs or firewalls may require adding TURN later.

# 2. Environment variables to enter

Vercel (Production):

```text
VITE_API_URL=https://api.leetbrofinder.rmkrv.com
```

For the temporary-URL test, initially set `VITE_API_URL` to the Railway-provided HTTPS URL, then replace it with the value above after the API custom domain works.

Railway:

```text
DB_URL=jdbc:postgresql://<Neon direct host>/neondb?sslmode=require&channelBinding=require
DB_USERNAME=<Neon database role>
DB_PASSWORD=<Neon database password>
FRONTEND_ORIGINS=https://leetbrofinder.rmkrv.com
```

For the temporary-URL test, initially set `FRONTEND_ORIGINS` to the exact Vercel deployment origin. During the domain transition it may contain both origins, comma-separated. Do not set `PORT`; Railway supplies it.

# 3. Cloudflare DNS records

Add these only after each provider displays its exact values, and remove any conflicting A, AAAA, or CNAME record for the same name. Railway requires both its CNAME and ownership-verification TXT record.

| Type | Name | Target | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| CNAME | `leetbrofinder` | `<Vercel-provided CNAME target>` | DNS only | Auto |
| CNAME | `api` | `<Railway-provided CNAME target>` | Proxied | Auto |
| TXT | `<Railway-provided TXT name>` | `<Railway-provided verification value>` | DNS only | Auto |

If Vercel displays an ownership-verification TXT record, add that TXT record exactly as shown too. For the proxied Railway record, set Cloudflare SSL/TLS mode to **Full** (not Full Strict) as Railway currently requires.

# 4. Production verification checklist

- Confirm Railway reports `/api/health` as healthy and returns `{"status":"ok"}` on its temporary URL.
- Confirm the Vercel temporary URL loads directly at `/login`, calls the Railway temporary API without CORS errors, and a page refresh keeps the SPA route.
- Verify profile search, LeetCode verification, account creation, login/logout, messages, partner matching, and a two-browser voice session.
- Add both custom domains and DNS records, wait for valid TLS certificates, update `VITE_API_URL` and `FRONTEND_ORIGINS` to the final origins, then repeat the health, login, deep-link refresh, messaging, and voice checks.
