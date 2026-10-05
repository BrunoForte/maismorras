# Mandatory local authenticated E2E: timing and diagnosis

## Workflow timing baseline

Workflow run #232 ran on the Linux GitHub Actions runner at commit `52f2923`. The job took about 19m12s. The relevant measured step boundaries in its logs were:

| Phase                                                   | Approximate duration | Notes                                                                                                                          |
| ------------------------------------------------------- | -------------------: | ------------------------------------------------------------------------------------------------------------------------------ |
| `supabase start` and migration application              |                141 s | Setup before application build and browser tests.                                                                              |
| `npm ci` plus Playwright Chromium/system dependencies   |                 46 s | Dependency installation; not Playwright execution.                                                                             |
| Backend build, process launch, and readiness (combined) |                 17 s | The combined app step started at 03:37:37 and Playwright began at 03:37:54; the old workflow did not measure these separately. |
| Playwright                                              |               15m03s | Included repeated 30-second timeouts and the configured retries after six tests failed.                                        |

The long Playwright duration was therefore not attributed to Supabase startup or dependency installation. Under the policy used by run #232, six tests each exhausting the 30-second timeout across the initial attempt and two retries could account for up to nine minutes of the test step.

## Current retry policy

In CI, Playwright now allows **one retry**, for at most **two total attempts per test** (the initial run plus one repeat). Local runs still default to zero retries. The local diagnostic script retains its explicit `-Retries` option, also defaulting to zero. The mandatory workflow does not pass a retry override, so it uses the CI policy from `playwright.config.ts`.

This trades faster termination for a higher chance that an intermittent test blocks the gate: persistent failures consume fewer repeated timeout windows, while a transient failure has only one opportunity to recover. This policy change does not establish or fix the cause of failures in run #232.

## Instrumentation

The mandatory job now writes durations for Supabase startup/migrations, local credential configuration, `npm ci`, Playwright browser/system installation, backend build, process launch, readiness polling, Playwright, and process shutdown to the GitHub step summary. A safe Playwright reporter records test title, status, retry number, duration, and explicit `test.step` names/durations. It never serializes errors, attachments, request data, snapshots, or environment values. Existing sanitization remains in place, and traces/network captures continue to be excluded from uploaded artifacts.

## Local measurements

The three consecutive no-retry runs and one `CI=true` run used Chromium, one worker, all three mandatory authenticated E2E files, unique accounts/campaigns/assets per test, and the existing local Supabase stack. Results:

| Run                                 |       Result | Playwright duration |               Retries |
| ----------------------------------- | -----------: | ------------------: | --------------------: |
| Local 1                             | 28/28 passed |          about 3.3m |                     0 |
| Local 2                             | 28/28 passed |             188.2 s |                     0 |
| Local 3                             | 28/28 passed |             189.3 s |                     0 |
| CI-configured local run (`CI=true`) | 28/28 passed |             193.9 s | 0 additional attempts |

On the CI-configured local run, backend build took 0.79 s, process launch 0.05 s, backend/frontend readiness 2.27 s, and process shutdown 0.01 s. The local Supabase startup and dependency-install phases were not measured in these runs because the local services and installed packages were already present.

The six scenarios failing in run #232 all passed in these four full-suite executions. The scenarios cover map-menu visibility, panel geometry/accessibility, floating chat/sheet reachability, independent panel resize/move, narrator spell display, and player sheet resize/navigation. The quick-roll scenarios for player and GM at 1, multiple, and 100 dice also passed in all repetitions; server result, chat persistence, and visual completion signal agreed. Available #232 diagnostics were timeout/error-context snapshots; traces and raw network captures were intentionally unavailable. The failures were not reproduced locally, so this evidence does not prove a shared functional defect or prove that CI runner load was the cause.

## Safe setup optimization

`createLocalAuthenticatedFixture` still creates fresh GM/player accounts, separate browser contexts, a campaign, scene, invite, and any per-test assets. Only the independent GM/player login interactions were moved to run concurrently. Authentication remains exercised in the browser; each test retains isolated identities and campaign data.

The previous serial measurements totaled about 38.5 s across the 28 fixture logins. The new concurrent login step totaled 25.5–29.5 s across the repeated runs, reducing that measured work by about 9–13 s per suite. Asset upload and campaign setup remain isolated; no sessions or mutable campaign state are shared across tests.

## Environment limitation and next CI check

The local runs reused the already-running Supabase stack instead of creating a fresh disposable stack: it had been running for roughly 12 hours and the optional local vector service was restarting. The tests used unique records and their fixture cleanup, and the harness refused non-loopback Supabase/database URLs, but this is not equivalent to a clean GitHub Actions runner. No reset, container recreation, or deletion was performed.

The local suite is stable across the four observed full runs, but the GitHub-runner issue is not considered resolved until the mandatory workflow passes on a fresh runner. On the next CI run, compare the new step-summary phases and safe per-test timings with run #232. A repeat timeout should be classified from its named `test.step` and sanitized error context; do not add retries or increase timeouts as a substitute for a reproduced cause.
