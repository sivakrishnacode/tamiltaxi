# How we use GitHub

The standard way to handle commits, issues, labels, milestones, releases, deploys and the project board, so every
part of the repo looks and works the same. Applies to the owner, Claude and contributors. The repo is **public**.

Two files are the source of truth and GitHub mirrors them on every push to `main` (`.github/workflows/github-sync.yml`
runs `scripts/sync_github.py`):

- [RELEASES.md](RELEASES.md) → [Releases](https://github.com/sivakrishnacode/tamiltaxi/releases) and their tags
- [ROADMAP.md](ROADMAP.md) → [Milestones](https://github.com/sivakrishnacode/tamiltaxi/milestones) and
  [Issues](https://github.com/sivakrishnacode/tamiltaxi/issues), shown on the "Tamil Taxi roadmap" project board

Edit the files, not GitHub, for anything they hold. GitHub is where people read, tick checklists, discuss and report.

---

## 1. Where things live

| What | Source of truth | On GitHub |
|---|---|---|
| Code | `main` | Commits; contributors' pull requests |
| App versions on Google Play, staging deploys | [RELEASES.md](RELEASES.md) | Releases + tags (automatic) |
| Planned work | [ROADMAP.md](ROADMAP.md) | Milestones + issues (automatic), project board |
| Bugs and ideas from people | GitHub issue forms | Issues (owner triages) |
| Website deploys | Vercel | Deployments (automatic) |
| Technical reference | [tech-docs/using.tech.md](tech-docs/using.tech.md) | — |
| Wiki | Not used: docs live in `docs/`, versioned and reviewed with the code | Off (Settings › Features › Wikis) |
| Security reports | [SECURITY.md](../SECURITY.md) (private advisory) | **Never** a public issue |
| Business plans, credentials | git-ignored `docs/private/`, `credentials.local.md` | **Never** |

Never on GitHub, in any issue, release, commit or comment: security gaps not yet fixed, keys and passwords, personal
data (real phone numbers, addresses, names of riders or drivers), business plans and talks with officials.

---

## 2. Commits

- **Format:** [Conventional Commits](https://www.conventionalcommits.org), `<type>(<scope>): <summary>`, summary in the
  imperative and at most 72 characters. Types and scopes are listed in [CLAUDE.md](../CLAUDE.md) §1.1 (`feat`, `fix`,
  `refactor`, `perf`, `test`, `docs`, `chore`, `revert`; `api`, `admin`, `passenger`, `driver`, `web`, `ui`, `data`,
  `infra`, `repo`).
  - Good: `fix(driver): D-06 shows the service city once the cities load`
  - Not: `fixed bug`, `Update d06_personal_details_screen.dart`, `feat: stuff`
- **Body:** what changed and why, plus anything a user will notice. Wrap at 72.
- **One logical change per commit**, and only once the checks pass (CLAUDE.md §1.3). Stage files by name.
- **Docs in the same commit:** `using.tech.md` for stack/env/endpoints/infra; for an app change, a line under that
  app's **Next release** in RELEASES.md, in plain words (the commit's own hash isn't known yet, so leave it out).
- **Issues:** `Closes #12` in the body closes the issue when the commit reaches `main`; `Refs #12` only links it.
- **Claude's commits** end with its `Co-Authored-By:` line.
- **Pushing:** only when the owner asks. Never force-push `main`, never rewrite pushed commits, never `--no-verify`.

## 3. Branches and pull requests

- The owner and Claude commit to `main`.
- Contributors: fork, branch from `main` (`feat/driver-demand-chip`, `fix/api-trip-cancel`), one change per PR, fill in
  the template, link the issue (`Closes #12`), CI green. See [CONTRIBUTING.md](../CONTRIBUTING.md).
- Merge with **Squash and merge**, the squashed message in Conventional Commits format, so `main` keeps one clean
  commit per change.

## 4. Issues

- **Planned work** (anything we intend to do): add a `###` item to [ROADMAP.md](ROADMAP.md) under its milestone (or
  **Backlog**) and push; the issue appears with its milestone and labels. Format:

  ```
  ### Ship Tamil Taxi Driver 0.1.1 to Google Play

  Issue: #2 · Labels: driver, release

  Why it matters, then a checklist:
  - [ ] First step
  ```

  `Issue: #N` is added once the issue exists (look it up on GitHub). The text is written to GitHub only when the issue
  is created; after that, tick checklists and comment on GitHub. Title, milestone and labels follow the file.
- **Bugs and ideas from people:** they use the issue forms (bug report, feature). The owner triages within a week:
  labels, a milestone if it's planned (then also add it to ROADMAP.md with its `Issue: #N`), or close it with a
  reason (not planned / duplicate).
- **Title:** the outcome, sentence case, no full stop, under ~70 characters. "Back up the Play upload keystore", not
  "keystore".
- **Body:** why it matters in one or two sentences, then a checklist of steps; link the docs instead of copying them.
- **Closing:** a commit with `Closes #N`; or `Status: done` on the item in ROADMAP.md; or on GitHub with the reason.
  The sync never reopens an issue.

## 5. Labels

Every issue gets at least one **area** label and one **kind** label.

| Area | For | | Kind | For |
|---|---|---|---|---|
| `rider` | `apps/passenger` | | `bug` | Something broken |
| `driver` | `apps/driver` | | `enhancement` | A new feature or improvement |
| `api` | `apps/api` | | `documentation` | Docs only |
| `admin` | `apps/admin` | | `release` | Shipping a version to Google Play |
| `web` | `apps/web` | | `launch` | Needed for the production launch |
| `infra` | Servers, AWS, Google Cloud, CI | | `plan` | Planned, not started (backlog) |

The planning labels are created by the sync (colours in `scripts/sync_github.py`); the rest are GitHub's defaults
(`good first issue`, `help wanted`, `question`, `duplicate`, `invalid`, `wontfix` as usual).

## 6. Milestones

- One per app upload (`Rider 0.1.1`, `Driver 0.1.1`) and one per larger goal (`Production launch`).
- Each is a `##` section of ROADMAP.md with a one-line `>` description; **Backlog** has no milestone.
- When a milestone is reached: mark its items `Status: done` (or close them by commit), close the milestone on GitHub
  (Milestones › Close), and later drop the section from ROADMAP.md.

## 7. Releases: an app version to Google Play

1. The milestone's release issue (e.g. "Ship Tamil Taxi Driver 0.1.1 to Google Play") lists the steps.
2. Raise `version:` in the app's `pubspec.yaml` (`0.1.1+2`; the `+N` version code goes up by one every upload).
3. Build the bundle with the upload key, upload it to the Play track, add release notes.
4. In RELEASES.md, turn **Next release** into the version entry with its `Release:` line, the track and status;
   start a new empty **Next release**.
5. In ROADMAP.md, mark the release item `Status: done` and add the next version's milestone section.
6. Commit (`docs(repo): record driver 0.1.1 on Google Play`) and push; the sync makes the tag and the GitHub release.

Tags are `passenger-vX.Y.Z+N` and `driver-vX.Y.Z+N`, made by the sync at the commit the bundle was built from. Never
push release tags by hand. Versions below 1.0 are pre-releases; 1.0 and later (production) become normal releases.

## 8. Staging deploys (API and admin)

Deploy as in [using.tech.md](tech-docs/using.tech.md) §9b (backup, rollback image, health checks), record it there,
and add an entry under **Staging** in RELEASES.md with tag `staging-YYYY-MM-DD` (`.2`, `.3` for later deploys that
day). The sync makes it a pre-release.

## 9. Project board: "Tamil Taxi roadmap"

A GitHub Project (board) owned by the account and linked to the repo. It shows every open issue; the sync can't reach
it (Projects belong to the account, not the repo), so it fills itself through the project's own workflows.

**Set up once (owner):**
1. Repo › **Projects** › **New project** › template **Board**, name "Tamil Taxi roadmap" › Create (it's linked to the
   repo).
2. Project **⋯ › Workflows**: turn on **Auto-add to project** (repository `tamiltaxi`, filter `is:issue is:open`);
   leave **Item closed → Done** and **Pull request merged → Done** on.
3. Add the existing issues once: **+ Add item** › **Add item from repository** › `tamiltaxi` › select all › Add.
4. Optional views: **+ New view** › Table, group by **Milestone** ("By milestone"); another filtered `label:launch`.

**Use:** Todo → In progress (move the card when work starts) → Done (automatic when the issue closes).

## 10. Routine

- **Every change:** commit as in §2; app changes go under **Next release**; close finished issues with `Closes #N`.
- **Every Play upload:** §7. **Every staging deploy:** §8.
- **Weekly:** triage new issues (§4), glance at the board, move what's in progress, drop finished milestones.

## 11. Automation

| Workflow | When | Does |
|---|---|---|
| `.github/workflows/ci.yml` | Every push and PR | `npm run check` and the API e2e suite |
| `.github/workflows/github-sync.yml` | Push to `main` changing RELEASES.md, ROADMAP.md or the script | Releases, tags, milestones, issues, planning labels |
| Vercel | Push to `main` | Deploys the website (Deployments page) |

Claude's GitHub connector can open issues but not label, edit or comment on them, so Claude manages planned work
through ROADMAP.md like everyone else.
