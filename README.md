# ShowUp — Capstone Project

ShowUp is a pickup-sports social app: users create and join sport events (Soccer, Tennis,
Pickleball, Volleyball), get matched with other players, chat, check in via GPS at game time,
and submit/confirm results. It's built as two separate projects:

| Folder | What it is | Stack |
|---|---|---|
| `ShowUp/` | Mobile app (this is the primary client — iOS/Android via Expo) | React Native + Expo Router, TypeScript |
| `ShowUpBackend/` | REST API | ASP.NET Core 8 (C#), Entity Framework Core, PostgreSQL (hosted on Supabase) |

**This is a mobile-first app.** The web build exists mainly as a fallback/testing surface —
see the Google Sign-In note below for the one feature that specifically requires it.

**This zip is pre-configured with working credentials — both `.env` files are already filled
in.** For the fastest possible test, skip to [Fastest way to test it](#fastest-way-to-test-it).

---

## Prerequisites

- **Node.js** LTS (18+) and npm
- **.NET 8 SDK** — `dotnet --version` should report `8.x`
- **Expo Go** app on a physical iOS/Android device — only needed if you want to test on a real
  phone instead of the web build (see below)

Nothing else to install or configure — the database, email, AI search, and OAuth credentials
are already in place.

---

## Fastest way to test it

```bash
# Terminal 1 — backend
cd ShowUpBackend
dotnet restore
dotnet run --launch-profile http

# Terminal 2 — frontend
cd ShowUp
npm install
npx expo start
```

Once Expo starts, press **`w`** to open the web build in your browser. This is the easiest
path because:
- No IP configuration needed — the included `.env` points at `http://localhost:5033/api`,
  which works immediately since both processes are on the same machine.
- It's also the **only way to test Google Sign-In** (see below).

Everything else — registration, event creation for all 4 sports, matchmaking, chat, live
check-in, results, notifications, AI-powered event search, admin endpoints — works with the
credentials already in the zip. No SMTP/API keys to obtain, no database to set up.

Swagger (to explore/demo the API directly): `http://localhost:5033/swagger`
Admin endpoints require header `X-Admin-Key: ShowUpDev2026_kX9mP2vQ7wL4nR8t`.

The database already has the full schema applied — you do **not** need to run
`dotnet ef database update` unless you want to double check (`dotnet run` will simply connect
to it as-is).

---

## Testing on an actual phone via Expo Go

The web build above is enough to see every feature, but if you want the real mobile experience:

1. Find your computer's LAN IP address (Windows: `ipconfig`, look for the IPv4 address on the
   Wi-Fi adapter your phone will also be on).
2. In `ShowUp/.env`, change `EXPO_PUBLIC_API_BASE_URL` from `http://localhost:5033/api` to
   `http://<your-computer's-IP>:5033/api`.
3. Restart Expo with `npx expo start -c` (the `-c` clears the cache — required, since
   `EXPO_PUBLIC_*` variables are baked in at bundle time and won't update on a running server).
4. Scan the printed QR code with the Expo Go app. Your phone must be on the same Wi-Fi network
   as the computer running the backend.

Android emulator: use `http://10.0.2.2:5033/api` instead. iOS simulator: `localhost` works
directly, no change needed.

**Note:** Google Sign-In will not work through Expo Go regardless of IP configuration — see below.

---

## ⚠️ Google Sign-In: web only, not supported in Expo Go

Email/password registration and login work everywhere (Expo Go, simulators, web). **Google
Sign-In only works in the web build.**

**Why:** the app authenticates with Google using `expo-auth-session`'s browser-redirect OAuth
flow, configured with a single **Web** OAuth Client ID (`src/hooks/useGoogleAuth.ts`) — there's
no separate Android/iOS native OAuth client registered. A Web-type Google OAuth client only
accepts redirects back to a real `https://`/`http://` origin that's on its allow-list. Expo Go
doesn't give the app a real web origin to redirect back to (it runs through an `exp://`
scheme / Expo's dev proxy), so Google rejects the redirect and the sign-in flow fails or hangs.
Running the app in a browser gives it a real `localhost` origin that matches the configured
Web Client ID, so the flow completes normally there.

**To demo Google Sign-In:** run `npx expo start`, press `w` to open the web build, and use
"Sign in with Google" from there. For every other feature, the mobile build (Expo Go or a
simulator) is the intended experience.

---

## Suggested demo flow

1. Register a new account, or sign in with Google (web only — see above).
2. Verification code arrives by real email (SMTP is configured) — check the inbox you registered with.
3. Browse events on the Home tab / map.
4. Create an event for any of the four sports (Soccer, Tennis, Pickleball, Volleyball) —
   note the sport-specific formation/position picker and equipment toggle.
5. Try the AI-powered natural-language event search (e.g. "soccer tonight near downtown") —
   fully functional, Cursor AI key is configured.
6. Join an event from another test account, or use the matchmaking/discovery tab to connect
   with another user and chat.
7. To demo the live check-in flow: create an event scheduled a few minutes out, wait for it to
   go live, check in (GPS-based, or manual fallback), then submit a result once it ends.
8. Open Swagger (`http://localhost:5033/swagger`) or hit an `/api/admin/**` endpoint with the
   `X-Admin-Key` header above to show the admin/API surface directly.

---

## About the included credentials

This zip ships with real, working values in both `.env` files (database connection, JWT
signing key, admin API key, Brevo SMTP login, Cursor AI key, Google OAuth/Maps keys) so it can
be tested with zero setup. If you're the student submitting this: **rotate the database
password and JWT key after grading is complete** (Supabase dashboard → Settings → Database for
the password; regenerate `Jwt:Key` to any new random 32+ character string). Both can be changed
at any time with no code changes — rotating the JWT key simply signs everyone out and requires
re-login, which is expected. Doing this ensures the copy of your credentials in this zip stops
being useful once you no longer need people to run the backend from it.

---

## Known issues / inspection reports

Two audit reports are included in each project folder documenting a full pre-delivery code
review (`ShowUp/INSPECTION_REPORT_FRONTEND.md`, `ShowUpBackend/INSPECTION_REPORT_BACKEND.md`),
covering what was found and fixed (auth/authorization gaps, cross-sport field-naming bugs,
etc.) and what remains as a known, documented limitation (e.g. no refresh-token flow — JWTs
are long-lived and there's no server-side revocation short of rotating the signing key).
