---
name: triaging-errors-before-retry
description: Use when a command, build, deploy, test run, or network request fails — especially when the error message, README, docs, or teammates say the failure is transient, flaky, or "rerunning usually fixes it".
---

# Triaging Errors Before Retry

## Overview

An error message is a **claim**, not a diagnosis. Code can (and often does) report a local problem — missing config, a typo'd key, failed validation — using words like `ETIMEDOUT`, "network error", or "try again". Retrying is an experiment that answers exactly one question: *is this transient?* That experiment only needs to run once.

**Core principle: two identical failures = deterministic. Deterministic failures are never fixed by a third run.**

## The Two-Strike Rule

1. **First failure:** read the full error. Note its *class* (what failed, not the cosmetic details).
2. **At most ONE retry**, and only if you have a concrete reason to suspect transience.
3. **Same class of failure again → it is deterministic. STOP rerunning.** Ignore changing attempt IDs, timestamps, or request IDs — those are cosmetics, not progress. Go read the code.

## Finding the Real Cause

Do these in order — they take under two minutes:

1. **Grep the literal error text in the local code** (the tool, script, or repo you're running). If the message matches a local `throw`/`fail`/`console.error`, you have found the emitter — the "network error" was manufactured by a local condition.
2. **Trace backward from the emitter:** what condition makes that branch fire? (missing key, unset env var, failed lookup, strict comparison).
3. **Check the inputs against what that code expects:** config files, env vars, arguments. Look for typos, wrong types, trailing whitespace, case mismatches.
4. Only after the emitter turns out to be a real external transport/service call are you allowed to conclude "external outage" — and even then, say what you verified.

## Rationalizations vs Reality

| Excuse | Reality |
|---|---|
| "The README/docs say it's flaky, rerunning usually fixes it" | Docs record folklore. A deterministic bug that *looks* like a timeout gets documented as flakiness. Two identical failures outrank the README. |
| "Each attempt has a unique ID, so the runs are being tracked / making progress" | Changing IDs are cosmetic. Same error class = same failure. |
| "It failed N times in a row, the network must really be down" | N identical failures is *stronger* evidence of a deterministic local cause, not weaker. Real transient failures vary. |
| "A colleague hit the same timeout earlier" | Then the colleague hit the same deterministic bug. Shared failure ≠ transient failure. |
| "I'll hand it back — try another network / wait a few minutes" | Escalating "wait and retry" without having read the emitting code is passing your diagnosis work to a human. |

## Red Flags — STOP and Triage

- You are about to run the identical command a **third** time.
- You are blaming infrastructure but have not opened the file that produced the error message.
- Your only evidence of transience is what the error text, docs, or a teammate *said*.
- Your report's next step is "retry later" and you cannot name the line of code that raised the error.
