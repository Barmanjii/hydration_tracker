# hydration_tracker

An Android hydration tracker built around one idea: **logging must be effortless,
and reminders must be smart.**

Most water trackers fail the same way. Logging is a chore, so it stops happening.
Reminders fire on a fixed schedule regardless of whether you just drank, so they
become noise and get muted. This one targets both directly.

## Principles

- **Logging takes under two seconds**, from the notification, without opening the
  app. Every design decision defers to this one.
- **Fully offline.** The app works with no network, including reminders. Sync is a
  convenience and never a requirement.
- **Reminders adapt.** They shift toward the times you actually lapse, rather than
  pinging when you were going to drink anyway.

## Deliberately not doing

Camera verification of drinking. It would mean pointing a phone at yourself for
every sip, and adding friction to the core loop is the one change guaranteed to
kill the habit it is trying to build. Intelligence belongs in the reminder, not in
a gate on the counter.

## Status

Early. Scaffold and pipeline first, features after.

## Platform

Android first. Reminder reliability is the entire product, and web push
notifications are too inconsistent to build on. The web target stays available from
the same codebase and is worth shipping later as a companion view for history.

iOS is out of scope. It cannot be built without macOS.

## Development

```bash
npm install
npm run android    # emulator or connected device
npm run typecheck
npm run lint
```

## Plan

The full plan, including scope, open questions, and acceptance criteria, lives in
[agents_plans](https://github.com/Barmanjii/agents_plans).
