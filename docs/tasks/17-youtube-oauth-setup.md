# Task 17 — One-time YouTube OAuth setup

**Plan ref:** docs/plan.md §8, §10
**Depends on:** none

## Objective
Obtain YouTube Data API credentials and a refresh token, and store them as
GitHub secrets for the publish workflow.

## Checklist
- [ ] Create a Google Cloud project and enable **YouTube Data API v3**.
- [ ] Configure the OAuth consent screen (External; add self as test user).
- [ ] Create an **OAuth Client (Desktop)** → obtain client id/secret.
- [ ] Obtain a **refresh token** for scope `…/auth/youtube.upload` (local helper / OAuth playground).
- [ ] Store `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` as GitHub secrets.
- [ ] Document the steps and the unverified-app private-lock caveat in the README.

## Done when
- The three YT secrets exist in the repo and `scripts/publish.ts` can authenticate.
