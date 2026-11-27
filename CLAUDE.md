# CLAUDE.md

Instructions for every Claude Code session working in this repo. Several sessions may run at the same time. Read "Parallel sessions" before touching git.

## Project in one paragraph

A city-utilities map app (bike racks, hospitals with ERs, bodegas, and more to come), growing out of BodegaMap. First city: Greater Boston (Boston + Cambridge); existing NYC bodega data stays. Expo SDK 58 + React Native + TypeScript (Expo Router) on the front end; Supabase (Postgres + PostGIS) on the back end. The app reads data only through RPC functions in `supabase/migrations/`. Current direction and phases: `docs/multi-category-plan.md`.

## Where things are written down

| File | What it holds |
|---|---|
| `docs/multi-category-plan.md` | The plan: phases, decisions made, open items. Holds conclusions, not raw research. |
| `docs/decisions.md` | Decision log, newest first. Add an entry for any decision with a "why". |
| `docs/research/` | Research notes and evidence (data sources, tool evaluations). One file per topic. |
| `docs/architecture.md` | How the system is built. |
| `docs/team-testing.md` | How people run and test the app (Expo Go, EAS updates, native builds). |
| `REVIEW.md` | Brief for the automated PR reviewer. |

## Parallel sessions

Sessions have distinct roles. Stay inside yours.

| Role | Works on | Doesn't touch |
|---|---|---|
| **App / code** | `src/`, `supabase/`, `app.json`, `eas.json`, `package*.json`, `.github/`, `docs/architecture.md`, `docs/team-testing.md`, `docs/multi-category-plan.md` | `docs/research/`, `scripts/` (unless the task is the data pipeline) |
| **Data import** | `scripts/` (import scripts, boundary files, `scripts/venv/`) | App code |
| **Research / strategy** | `docs/research/` only | Everything else, including the plan doc |

Rules:
1. **Research and strategy sessions run in their own git worktree** (start the session with a worktree in the desktop app), on a branch named `research/<topic>`. They never edit files in the main checkout.
2. **Research goes in `docs/research/<topic>.md`, not the plan doc.** When a finding should change the plan, say so at the top of the research note ("Suggested plan changes"); the app/code session updates `docs/multi-category-plan.md` and links to the note.
3. **Commit your own work early and often**, even small doc changes. Uncommitted edits are what block other sessions.
4. **Stage files by name. Never `git add -A` or `git add .`** If `git status` shows changes you didn't make, leave them alone. Don't commit, stash, revert or reformat them, and mention them to the user.
5. **Don't switch branches, pull, merge or reset in a way that would overwrite another session's uncommitted files.** If git refuses because of someone else's changes, stop and tell the user. (To move the main checkout to an updated `main` without disturbing others' edits: `git fetch` then `git branch -f main origin/main` then `git checkout main`, which works when those files are identical on both sides.)

## Git and PR workflow

- **Code changes go through a PR:** branch off `main`, push, open a PR. Two checks run:
  - **Build check** (`.github/workflows/ci.yml`): `npm ci`, `tsc --noEmit`, `expo-doctor`, iOS bundle export. Must pass.
  - **Claude code review** (`.github/workflows/claude-review.yml`), guided by `REVIEW.md`. Advisory; read it before merging.
- **Docs-only research branches** can be merged directly by the user.
- Edits to `claude-review.yml` don't take effect on a PR until the same change is on `main`. The action refuses to run a workflow that differs from `main`'s.
- Merge with a merge commit (keeps history). Delete the branch after merging.
- Commit messages: say what changed and why. End with the co-author line the session's instructions specify.

## Checks to run before opening a PR

```
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios --output-dir <temp dir>
```
Device behavior (map, compass, clustering) can only be confirmed on a real iPhone. Ask the user, and don't claim it.

## Secrets

- The app may only contain `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Locally they live in `.env.local` (gitignored); for builds and updates they're stored in EAS environments.
- The Supabase **service-role key** is only for `scripts/` and lives in `scripts/.env` (gitignored). Never put it in app code, docs, commits or chat.
- Never ask the user to paste tokens, passwords or keys into chat. They enter them directly where needed (GitHub secrets, `npx expo login`, Apple sign-in).

## Running the app

- Dev server for Expo Go: `npx expo start --tunnel --go`. On a physical iPhone, Expo Go and the Expo CLI must be signed in to the same Expo account.
- Publish a test update: `npx eas-cli@latest update --branch preview --environment preview --platform ios --message "..."` (only `bodegamap` Expo organization members can open it).
- Native builds (development / preview / production via `eas.json`) are set up, pending Apple Developer enrollment. See `docs/team-testing.md`.
