# 0xramp sells run in the browser with a native send

A sale (off-ramp) uses the 0xramp SDK in its browser-hosted mode, as described
in section 9 of the SDK's partner guide. The app creates a session against the
0xramp partner API, opens the session page in the auth-session browser from
ADR 0003, and receives 0xramp's send request as a link on the return scheme
`zingo://0xramp`. The app verifies that link against 0xramp's record, journals
it, shows a native confirmation sheet with the fee, signs and broadcasts the
deposit with zingolib, and reopens the session page with the transaction id.
The ticketed status endpoint is the only receipt for the fiat leg.

## Considered Options

- **The SDK's WebView bridge.** Rejected, for the reasons in ADR 0003: the
  pane's passkeys do not work in a WebView, and the browser-hosted mode is a
  supported hosting mode of the SDK.
- **A generic `zcash:` payment URI from the pane.** Rejected. The SDK's
  handoff carries a session reference and a request id, which bind the send to
  one sale and make it exactly-once through the journal. `zcash:` stays free
  for ZIP-321 payments.
- **Sending without the proposal step.** Rejected. zingolib proposes first and
  sends the stored proposal second, which gives the sheet the exact ZIP-317 fee
  before the user confirms.
- **Installing the SDK from npm.** Not possible yet. The repository is a git
  submodule at `vendor/0xramp-sdk`, built with `pnpm sdk:build`, and linked
  with a `file:` dependency.

## Consequences

- The app scheme is `zingo`. The server allowlist compares the return URL as
  an exact string, so `zingo://0xramp` is a constant and never built with
  `Linking.createURL`.
- Expo Router would route `zingo://0xramp?…` to a route named `0xramp`.
  `src/app/+native-intent.tsx` returns `null` for ramp links, so the router
  ignores them and the ramp context handles them from `expo-linking`.
- On iOS the auth-session sheet closes itself on every navigation to the
  scheme and returns the link as the result of `openAuthSessionAsync`. On
  Android the link arrives as a `url` event. Both reach the same handler, which
  drops a link it saw in the last minute.
- The session record and the send journal live in `expo-secure-store`. The
  journal is never erased. Forgetting a session clears only the session
  pointer, and switching wallets does the same.
- A declined, expired, or failed send is journaled as a cancel or pending reply
  and never retried by the app. A thrown send error is pending, not a cancel,
  because the broadcast may have happened.
- zingolib's `propose_send` pauses its sync engine until the proposal is sent
  or discarded, and both calls take the client's write lock. A send waits for
  the current sync batch to finish.
- Only SELL is wired: the Partner API serves SELL sessions in this flow, and
  the pane's browser path does not complete BUY. The Home screen's "Add" button
  became "Sell".
- Staging is mainnet. A send moves real ZEC.
