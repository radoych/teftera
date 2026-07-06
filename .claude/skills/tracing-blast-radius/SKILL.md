---
name: tracing-blast-radius
description: Use when renaming or changing anything referenced in more than one place — identifiers, string constants, enum/category/config names, DB columns, API fields, file paths — before making the first edit.
---

# Tracing Blast Radius

## Overview

A rename is not done when the old text is gone from the repo. It is done when every **consumer** of the old value agrees — and some consumers live outside the repo, where grep and the compiler cannot see them.

**Core principle: the repo is only one of four surfaces. Deployed state keeps the old value until you migrate it.**

## The Four Surfaces (REQUIRED)

Before editing anything, produce this table. Every row MUST be filled in — write `none` only with a one-line justification. Include the completed table in your final report.

| Surface | How to enumerate | Found |
|---|---|---|
| 1. Compiler-checked refs (types, imports, call sites) | typecheck after the change | |
| 2. Unchecked text (string literals, regexes, SQL, config, env, docs) | grep every spelling, alias, and case variant of the old value | |
| 3. Tests and fixtures | grep test/fixture dirs separately — they often hold copies | |
| 4. Deployed & persisted state (DB rows, applied migrations, stored JSON payloads, caches, other apps/services that consume this value) | ask: "where does this value already LIVE outside this repo?" — grep cannot answer this | |

Surface 4 is the one everyone misses. If the value was ever written to a database, sent to an API, or shipped in a release, the old value still exists out there right now, and your diff does not change it.

## History Is Append-Only

If a value was shipped by an already-applied migration, published release, or recorded fixture:

- **Never edit the old migration/release file.** Applied migrations never re-run; the edit is a no-op on every existing environment and creates silent drift between the file and reality.
- **Write a NEW migration/patch** that transforms the existing state (e.g. `UPDATE ... SET name = 'New' WHERE name = 'Old'`, plus replacing any seed function so *future* rows also get the new value).

Red flag: your diff touches a file whose name contains a timestamp or version number that has already been applied or released.

## Process

1. Enumerate: fill in the four-surface table (greps for all variants of the old value + the deployed-state question).
2. Change: edit every repo consumer; handle surface 4 with new migrations/backfills, never by editing history.
3. Verify: re-grep the old value → zero hits in source; typecheck; run the full test suite; state in your report what you did about deployed state — `deployed state: none, because <reason>` is an acceptable answer, silence is not.

## Rationalizations vs Reality

| Excuse | Reality |
|---|---|
| "grep found nothing left, the rename is complete" | grep sees the repo. Deployed rows, stored payloads, and external consumers still hold the old value. |
| "I updated the migration file, so the DB is handled" | Applied migrations never re-run. Editing one changes nothing in any environment. |
| "All tests pass" | Tests exercise repo code against fixtures, not production data. |
| "The DB isn't my job here" | Then say so explicitly in the report so a human can act. Omitting surface 4 silently is the failure. |

## Red Flags — STOP

- Your report claims "complete/consistent everywhere" but never mentions data, migrations, or external consumers.
- Your verification is grep + tests only, for a value that lives in a database.
- Your diff modifies an already-applied migration or an already-published artifact.
