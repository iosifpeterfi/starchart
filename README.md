# Star Chart

A family chore-tracking and reward app that gamifies household tasks with a star/points system. Kids complete daily chores, earn stars, and can cash them out (10 stars = 1 EUR). Families sync across devices in real-time via Firebase, secured with end-to-end encryption.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | Vanilla JS single-page app (`web/index.html`) |
| Android | Kotlin + WebView wrapper (`app/`) |
| Backend | Firebase (Firestore, Auth) |
| Auth | Google Sign-In via Firebase Auth |
| Encryption | AES-GCM 256-bit, PBKDF2-SHA256 key derivation |
| Web hosting | Cloudflare Pages |
| Build | Gradle 8.5.2, Kotlin 2.0.20, Android SDK 35 (min 26) |

## Privacy & Security

### End-to-End Encryption

All family data stored in Firestore is **end-to-end encrypted**. The server never sees plaintext data.

- **Algorithm:** AES-GCM 256-bit with a unique random salt and IV per encryption
- **Key derivation:** PBKDF2-SHA256 with **300,000 iterations**
- **Key material:** PIN + family code combined as the secret input
- **What's encrypted:** All task data, completion history, points, withdrawals — everything in the `sc_*` localStorage namespace
- **What's NOT encrypted:** Member UIDs, member emails, pending invites, timestamps (needed for access control)

The encryption key never leaves the device. Firebase stores only the encrypted blob.

### PIN Security

- **Variable length:** 6 to 10 digits (user's choice)
- **Progressive lockout:** After 3 failed attempts, escalating wait times:
  - Attempt 4: 30 seconds
  - Attempt 5: 1 minute
  - Attempt 6: 5 minutes
  - Attempt 7: 10 minutes
  - Attempt 8+: 30 minutes
- **Uniform error messages:** Wrong PIN and access-denied show the same "Wrong PIN" message — no information leakage about membership status
- **Shake + vibration:** Visual and haptic feedback on failure
- **Owner-only PIN reset:** Only the family owner can change the PIN, re-encrypting all data
- **Auto-lock:** 5-minute inactivity timeout clears the PIN from memory

### Authentication & Access Control

- **Google Sign-In only** — no password storage, no custom auth
- **Email verification required:** Only verified Google accounts can join as pending members or be recognized as email members
- **Member-based Firestore rules:**
  - **Read:** Any authenticated user (family code acts as a knowledge factor)
  - **Create:** Any authenticated user (must include their own UID)
  - **Update:** Existing members OR invited pending members only
  - **Delete:** Members only
- **Owner role:** Tracked by UID, auto-assigned to the creator. Owner can reset PINs and remove members
- **Invitation flow:** Members must be pre-invited by email before they can join. The `pendingMembers` array controls who is allowed to self-add

### Member Management

- **Member map:** Email-to-UID mapping stored in Firestore enables full removal (UID from `members`, email from `memberEmails`, map entry deleted)
- **Removed members are blocked:** Membership is checked at PIN entry time — removed users see "Wrong PIN" and cannot decrypt
- **No session persistence after removal:** Firestore rules prevent removed users from reading or writing

### XSS Prevention

- **HTML escaping:** All user-supplied and synced data is escaped via `esc()` before rendering (covers `& < > " '`)
- **No inline event handlers with user data:** Member management uses `data-*` attributes with `addEventListener` instead of `onclick` with string concatenation
- **Firestore field sanitization:** Email-based memberMap keys escape `. / $ [ ] #` to prevent field path injection

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com;
style-src 'self' 'unsafe-inline';
img-src https: data:;
connect-src https://*.googleapis.com https://*.firebaseio.com
            https://*.cloudfunctions.net wss://*.firebaseio.com
            https://securetoken.googleapis.com;
frame-src https://accounts.google.com https://*.firebaseapp.com;
object-src 'none';
base-uri 'none';
form-action 'self';
upgrade-insecure-requests;
frame-ancestors 'none';
```

Key restrictions:
- **`object-src 'none'`** — no plugins/Flash
- **`base-uri 'none'`** — prevents base tag hijacking
- **`frame-ancestors 'none'`** — prevents clickjacking (cannot be embedded in iframes)
- **`upgrade-insecure-requests`** — forces HTTPS for all resources
- **`form-action 'self'`** — prevents form submission to external domains

### Android Security

- **`allowBackup="false"`** — prevents ADB backup extraction of app data
- **`usesCleartextTraffic="false"`** — enforces HTTPS only
- **`allowFileAccess` and `allowContentAccess` disabled** on WebView — no local file access
- **Safe token passing:** Google Sign-In ID tokens passed to JavaScript via `JSONObject.quote()` (prevents injection)
- **External links:** URLs outside the app domain open in the system browser, not the WebView

### Data Sync Security

- **Family code excluded from sync:** `sc_family_code` is never included in `exportAllData()`, `importAllData()`, or `mergeFromRemote()` — prevents overwrite attacks
- **Conflict resolution:** Local changes within 5 seconds take priority over remote; remote wins after that
- **Real-time listener:** Firestore `onSnapshot` with `skipNextSnapshot` flag to prevent echo loops
- **Encryption version tracking:** v1 (legacy, PIN-only, 100K iterations) and v2 (PIN+familyCode, 300K iterations) with automatic detection on decrypt

### What We Don't Do

- **No analytics or tracking** — zero third-party analytics, no usage data collection
- **No ads** — the app is completely ad-free
- **No server-side data access** — all data is encrypted client-side; even with database access, data cannot be read without the PIN
- **No password storage** — authentication is delegated entirely to Google
- **No unnecessary permissions** — Android app only requests `INTERNET`

## Project Structure

```
StarChart/
├── app/                        # Android module
│   └── src/main/
│       ├── java/.../MainActivity.kt   # WebView shell + Google Sign-In bridge
│       ├── AndroidManifest.xml
│       ├── res/                # Icons, themes, strings
│       └── google-services.json
├── web/
│   └── index.html              # Full SPA (HTML + CSS + JS inline)
├── firestore.rules             # Firestore security rules
├── gradle/                     # Gradle wrapper
├── build.gradle.kts            # Root build config
└── settings.gradle.kts
```

## Features

### Screens
1. **Auth** — Google Sign-In → family create/join with 12-character code → 6-10 digit PIN lock
2. **Dashboard** — "Must Do" (mandatory, no points) + "Earn Stars" (optional, points) task cards
3. **Today's Report** — daily stats, completed tasks list
4. **History** — last 30 days, per-day star counts and task details
5. **Money** — balance (stars → EUR), cash-out button, withdrawal history
6. **Admin** — summary stats, 14-day bar chart, daily log, task management
7. **Cloud Sync** — account info, member list, invitations, family code, owner settings

### Core Mechanics
- Real-time Firestore sync with conflict resolution
- End-to-end encrypted sync (AES-GCM + PBKDF2)
- "Must Do" tasks gate access to "Earn Stars" tasks
- Completion animations (bounce + confetti)
- Unlock animation (fade-up transition)
- Multi-device family sharing via 12-character family code
- Owner-managed member list with invite/remove
- Progressive lockout on failed PIN attempts
- 5-minute auto-lock on inactivity

## Deployment

- **Web:** `web/` folder deployed to Cloudflare Pages
- **Android:** Debug APKs built with Gradle
- **Firebase project:** `starchart-373cd`
