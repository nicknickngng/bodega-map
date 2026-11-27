# Testing the app on your phone (team guide)

How teammates run and test the app on an iPhone. Last verified 2026-11-25 on Expo SDK 58.

There are two ways in, depending on whether you're changing code.

| | **Testers** (try the latest version) | **Coders** (run your own changes live) |
|---|---|---|
| What you need | iPhone + **Expo Go** from the App Store | The above, plus Node.js and this repo on your laptop |
| Expo account | Free account at expo.dev, signed in to Expo Go | Same, signed in to Expo Go **and** the Expo CLI with the **same** account |
| How you open the app | Scan the QR code from the latest published update | Scan the QR code from your own dev server |
| Needs a laptop running? | No | Yes, yours |

---

## Testers: open the latest published update

1. Install **Expo Go** from the App Store and sign in with your Expo account.
2. Open the latest update's page on expo.dev (ask the project owner for the link, or find it under **Updates** in the project dashboard).
3. Click **Preview** and scan the QR code with your iPhone camera. The app opens in Expo Go.

> **You must be a member of the Expo project.** Confirmed 2026-11-25: the update opened for the project owner but not for a friend's account. Ask the project owner to invite you to the Expo organization (see "Project owner" below), then sign in to Expo Go with that account.

## Coders: run the app from your laptop

One-time setup:
1. Install Node.js (LTS). Clone the repo and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and anon key (ask the project owner). **Only the anon key.** Never put the service-role key in the app or share it.
3. Run `npx expo login` and sign in with your Expo account.
4. In Expo Go on your iPhone, sign in with **the same** Expo account.

Every time:
```
npx expo start --tunnel --go
```
Scan the QR code with your iPhone camera.

`--go` tells the dev server to serve Expo Go. The project now includes `expo-dev-client` (for the upcoming development build), so without `--go` the server expects the development build instead. Once you have the development build installed (see below), drop `--go`.

**Why the same account?** Since SDK 58, Expo Go on a physical iPhone opens a project served from a laptop only if Expo Go and the Expo CLI on that laptop are signed in to the same account. That's also why **you can't scan a teammate's dev-server QR code**. Run your own, or open a published update instead.

`--tunnel` uses Expo's own tunnel, so it works on networks like Harvard Wi-Fi that block phone-to-laptop connections.

## Testing another location (dev tool)

On the **Map** tab, tap **DEV: set location**, then tap anywhere on the map. The compass and map then act as if you're standing there, and a purple "DEV: spoofed location" banner shows on every screen. Tap **Use GPS** in the banner to go back to real GPS. The compass still uses your phone's real heading.

Available when running from a dev server and in updates/builds from the EAS `development` and `preview` environments (`EXPO_PUBLIC_DEV_TOOLS=1`). Never in TestFlight/production.

## Publishing an update for testers

From an up-to-date checkout (signed in to the Expo CLI as a project member):
```
npx eas-cli@latest update --branch preview --environment preview --platform ios --message "what changed"
```
- `--environment preview` is required. It builds with the Supabase settings stored in EAS (Expo dashboard → project → Environment variables), **not** your local `.env.local`. To change them, update them there.
- The command prints a dashboard link. Share it with testers.
- Use `--platform all` if any testers are on Android. So far only iOS has been tested.

## Project owner

- The EAS project is `@bodegamap/bodegamap`, owned by the **`bodegamap` Expo organization** (transferred 2026-11-27). **Published updates only open for organization members**, so invite each teammate's Expo account under Organization settings → Members (Developer to publish, Viewer to test). **Confirmed 2026-11-27:** a Viewer account in the organization can open published updates.
- For people outside the team (classmates, demo audiences), membership doesn't scale. Use **TestFlight**'s public link instead, which needs no Expo account at all (Apple Developer account required).
- The Supabase URL and anon key are stored in EAS for the `development`, `preview` and `production` environments.

## Native builds (set up; waiting on Apple Developer enrollment)

`eas.json` defines three build types. Each one reads its environment's settings and listens to its own update channel:

| Build type | For | Install | Update channel |
|---|---|---|---|
| `development` | Coders: our own "Expo Go" with live reload | Registered iPhones only (each coder opens a registration link once, then turns on iOS Developer Mode) | `development` |
| `preview` | Internal test builds | Registered iPhones only | `preview` |
| `production` | TestFlight (testers and strangers) | TestFlight app; no registration | `production` |

- **Updates are matched by "fingerprint":** EAS fingerprints the app's native code, and an update only reaches builds with the same fingerprint. Adding or upgrading a native library changes the fingerprint and means a new build. JavaScript-only changes don't.
- **Publishing to a build type:** use `--branch` with the channel name, e.g. `--branch production --environment production` for TestFlight users. Expo Go testers keep using `--branch preview`.
- The iOS bundle identifier is `com.nicknickngng.citymap`. It's neutral because the app's name is still open; users never see it.

## Known limits (and when we outgrow this setup)

- **Expo Go supports only the newest Expo SDK.** When Expo ships SDK 59 and the App Store's Expo Go updates, the app will stop opening (it crashes or shows "incompatible") until the project is upgraded. That happened with SDK 54 → 58.
- **Expo Go can't include custom native code.** The planned custom basemap (Google provider or MapLibre) will need a **development build** or **TestFlight**. Both need an Apple Developer account ($99/yr) and are built in the cloud by EAS, so no Mac is needed.
