# AGENTS.md

Read this before writing code here. It records decisions already made and traps
already hit, so neither has to be rediscovered.

`CLAUDE.md` is a one line import of this file. Keep content here, so the two
cannot drift.

---

## Expo has changed

Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing
code. Older Expo answers are common in training data and confidently wrong for
this version.

Expo 57, React 19.2, React Native 0.86, TypeScript 6.

---

## What this is

An Android hydration tracker. Logging must be effortless, and reminders must
adapt to when the user actually lapses.

The plan, with scope and acceptance criteria, is in
[agents_plans](https://github.com/Barmanjii/agents_plans). Read
`002_hydration_tracker.md` before proposing a feature. If a change makes the plan
wrong, update the plan in the same pull request.

---

## Decisions already made

Do not relitigate these without a new reason.

| Decision | Why |
|---|---|
| Android first | Reminder reliability is the whole product, and web push is too inconsistent to build on. |
| No iOS | Cannot be built without macOS. Do not add iOS specific code or suggest EAS iOS builds. |
| Local first, fully offline | Must work with no network, including reminders. Sync is a convenience, never a requirement. |
| No camera verification of drinking | Friction in the core loop is the one change guaranteed to kill the habit. Intelligence goes in the reminder, not in a gate on the counter. |
| Statistics before models | Reminder timing is plain counting. Reach for a model only once simple statistics have demonstrably failed. |
| A logical day starts at 4am | A drink logged at 1am belongs to the night before. Midnight rollover would break a streak for someone merely awake late. |

---

## Architecture

One rule, and it is load bearing:

**`src/domain` is pure. `src/data` is thin.**

All arithmetic lives in `src/domain`, so it is testable with no device, emulator,
or real SQLite. `src/data/db.ts` stores and retrieves rows and does no counting.
If a function there starts doing arithmetic, move the arithmetic to the domain
layer rather than testing the database.

`src/ui` holds one hook and one screen. The hook wires the two layers together
and holds no arithmetic either.

---

## Commands

```bash
npm install
npm run android      # emulator or connected device
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # jest
```

CI runs those four checks, plus two that have no npm script:

```bash
npm audit --audit-level=critical           # fails on critical only, by design
npx expo export --platform android         # proves the app bundles
```

---

## CI traps

Each of these has already cost time once.

- **`assembleDebug` does not bundle JavaScript.** Debug APKs load from Metro at
  runtime, so a missing or misspelled module passes a green `android debug build`
  and crashes on launch. The `bundle` job is the only check that proves the app
  starts. Type check does not catch it either: a path that resolves for `tsc` can
  still fail Metro's resolver.
- **`npm audit` misresolves the Expo tree.** It reports advisories whose
  suggested fix is downgrading Expo and React Native below the pinned versions.
  The audit job therefore fails on `critical` only. Do not tighten it to `high`
  without reading the comment in `ci.yml` first.
- **Do not add `cache: gradle` to `setup-java`.** It resolves its cache key from
  gradle files at checkout, and `android/` does not exist until `expo prebuild`
  generates it. There is an explicit `actions/cache` step after prebuild instead.
- **Piping a check through `tail` hides its exit code.** `npm run typecheck |
  tail -3` reports success whatever `tsc` did. Redirect to a file and check `$?`.

---

## How work moves

**Never commit directly to `main`.** It is protected with `enforce_admins` on, so
the push is rejected for everyone including the repository owner.

Enable the local guard once per clone, so this fails immediately rather than
after the objects upload:

```bash
git config core.hooksPath .githooks
```

1. Branch as `prefix/short_description`: conventional prefix, underscores in the
   description, never hyphens. Example: `feat/streak_counter`.
2. Commit in small coherent units with conventional prefixes: `feat`, `fix`,
   `docs`, `test`, `refactor`, `style`, `perf`, `ci`, `build`. Never `chore`.
3. Open a pull request and fill every section of the template.
4. Keep it reviewable in one sitting. Past a few hundred meaningful lines, split
   it or stack it.

### Parallel or stacked

Default to **parallel**: independent branches off `main` with disjoint file sets
merge in any order with no rebasing.

**Stack only when a branch genuinely needs the one below it**, such as two
branches editing the same file where the second builds on the first.

```bash
gh stack add <branch>
gh stack submit --auto --open
gh stack merge <stack-number> --yes --rebase
```

`gh pr merge` **fails on a stacked pull request**; it requires the async merge
API. Use `gh stack merge`, which merges the whole stack atomically.

### Merging

- **Rebase, never squash.** The repository allows rebase merge only. Squash puts
  a commit on `main` that is not an ancestor of its branch, so every branch
  stacked above reapplies changes `main` already has, turning a clean stack into
  a conflict on every merge.
- Required checks are **strict**, so a branch must be current with `main`. Each
  merge makes the others `BEHIND`, needing a rebase and a fresh CI run. Merging
  several means several rounds. Do not relax the protection to avoid this.
- Merged branches delete themselves.

---

## Writing conventions

These apply to code comments, documentation, commit messages, pull request
descriptions, and any text the user sees in the app.

- **No em dashes, and no hyphens mid sentence.** Use a comma, a colon, a full
  stop, or rewrite.
- **Never mention Claude, any AI tool, or "generated by"** anywhere, including
  commit messages and pull request descriptions.
- No co author trailers on commits.
- Comments explain why, or what stage, never what the code plainly does. Put them
  only where a reader would otherwise stall.

---

## Testing

Test logic that is easy to get wrong and hard to notice when it is wrong. Here
that means dates and counting, not rendering.

Worth testing: day boundary handling, daily totals, streak calculation across
missed days and month or year boundaries, reminder selection given a logging
history.

Not worth testing: that a component renders, library behaviour, or anything whose
failure is obvious on opening the app.

Coverage percentage is not a goal.

Do not suppress a lint rule to make a test or a hook pass. When
`react-hooks/set-state-in-effect` fired, the fix was restructuring to a reload
token and a cancellation flag, which was the better pattern anyway.

---

## What never goes in this repository

It is public.

- Nothing about any employer, past or present. Not architecture, not tooling, not
  process, not even unnamed.
- No personal information about any real person.
- No credentials, tokens, keys, or signing material.
- No real user data in fixtures. Generate it.
