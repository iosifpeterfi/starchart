# Star Chart

A family chore-tracking and reward app that gamifies household tasks with a star/points system. Kids complete daily chores, earn stars, and can cash them out (10 stars = 1 EUR). Families sync across devices in real-time via Firebase, secured with PIN-based encryption.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | Vanilla JS single-page app (`web/index.html`, ~51KB) |
| Android | Kotlin + WebView wrapper (`app/`) |
| Backend | Firebase (Firestore, Auth, Storage) |
| Auth | Google Sign-In via Firebase Auth |
| Encryption | AES-GCM 256-bit, PBKDF2 key derivation (100k iterations) |
| Web hosting | Cloudflare Pages — `https://starchart-3rm.pages.dev` |
| Build | Gradle 8.5.2, Kotlin 2.0.20, Android SDK 35 (min 26) |

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
├── gradle/                     # Gradle wrapper
├── build.gradle.kts            # Root build config
└── settings.gradle.kts
```

## Features

### Screens
1. **Auth** — Google Sign-In → family create/join with shareable code → 6-digit PIN lock
2. **Dashboard** — "Must Do" (mandatory, no points) + "Earn Stars" (optional, points) task cards with emoji icons
3. **Today's Report** — daily stats, completed tasks list
4. **History** — last 30 days, per-day star counts and task details
5. **Money** — balance (stars → EUR), cash-out button, withdrawal history
6. **Admin** — summary stats, 14-day bar chart, daily log, task management (delete/restore)
7. **Cloud Sync** — account info, sync status, family code, sign out/reset

### Core Mechanics
- Real-time Firestore sync with conflict resolution
- PIN-encrypted local storage (AES-GCM + PBKDF2)
- "Must Do" tasks gate access to "Earn Stars" tasks
- Completion animations (bounce + confetti)
- Multi-device family sharing via family code
- 30-second background sync interval

## Design

| Token | Hex | Use |
|-------|-----|-----|
| Primary orange | `#FF9B35` | Status bar, buttons, borders |
| Accent yellow | `#FFEE3F` | Gradient highlights |
| Success green | `#4CAF50` | Completed / optional tasks |
| Background cream | `#FFF8E7` | App background |
| Card white | `#FFFFFF` | Task cards |

## Android Build

- **Package:** `com.peterfi.starchart`
- **Version:** 6.0 (code 6)
- **Target SDK:** 35 / Min SDK: 26
- **Orientation:** Portrait only
- **Dependencies:** AndroidX Core KTX, AppCompat, WebKit, Play Services Auth 21.2.0

## Deployment

- **Web:** Deploy `web/` folder to Cloudflare Pages (account + API token stored separately)
- **Android:** Debug APKs built locally (v2–v10 iterations in workspace root)
- **Firebase project:** `starchart-373cd`

## Default Tasks

12 pre-configured chores (brush teeth, get dressed, clean toys, etc.) with 16 selectable emojis for customization.
