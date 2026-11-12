# 0xramp browser-hosted integration: findings for 0xramp

Status on 2026-11-06. Nothing has run on a device yet. Items marked "to verify
on device" are expectations from the platform code, not observations.

## Done without funds

1. The SDK is a git submodule at `vendor/0xramp-sdk` on `main`
   (`f3af6663edaf57e4c700d1c3c4d67d9df3e94d54`), built with
   `npm ci --ignore-scripts && npm run build`. Its 212 tests pass.
2. The app registers the scheme `zingo`. The return URL is the exact string
   `zingo://0xramp`. A prebuild shows `zingo` in `CFBundleURLSchemes` on iOS
   and an `android:scheme="zingo"` intent filter on a `singleTask` activity on
   Android.
3. A session was created against staging with the agreed parameters
   (partnerId `zingo`, fiat `VEN`, returnUrl `zingo://0xramp`, locale `es`,
   direction `sell`). The response carried `sessionRef`, `sessionUrl`,
   `statusTicket` (43 characters) and `expiresAt` (24 h). The pane origin
   equals the API origin, so the client runs with the default `paneOrigins`.
   The session page is `/partner/zingo?sessionRef=…#…`. The ticketed status
   read and the recorded-send-request read were not exercised from the app
   yet.
4. The app opens `sessionUrl` in `openAuthSessionAsync` with the return URL
   and routes every link it gets back, from the auth-session result and from
   the `url` event. Email sign-in and the links back were not tried on a
   device.
5. The native send is exposed as `proposeSend(address, amountZats)` (returns
   the ZIP-317 fee), `sendProposed()` (returns the txids) and
   `discardProposal()`. `verifyZecSendHandoff` runs before the journal claim
   and before the confirmation sheet, exactly as the guide asks.

## Sessions created so far

| sessionRef | partnerSessionId | What happened |
|---|---|---|
| `RW8BYqAU5ukuWvpf67e4Jnmk2tYsBeT7` | `zingo-probe-…` | Created from a script with `curl` to check the response shape. Never opened in a browser. No account signed in, no confirmation in the pane. |

No funded sale was attempted. No account confirmed a deposit in the pane.

## Findings

1. **SDK fetch through a proxy.** The SDK's `fetch` with `redirect: "error"`
   reported `NetworkUnavailable` from Node when outbound traffic goes through
   an HTTP CONNECT proxy, while `curl` through the same proxy got `201`. Not a
   device finding, but partners behind corporate proxies will see the same
   wording for every failure. A hint about the underlying cause would help.
2. **`zcash:` is unaffected.** The ZIP-321 scheme is not registered by this
   app at all, so there is no conflict with the ramp scheme.
3. **Expo Router and the return scheme.** Expo Router maps `zingo://0xramp?…`
   to a route named `0xramp` and would show "unmatched route". The app ships
   a `+native-intent` handler that swallows ramp links, and the ramp
   controller reads them from `expo-linking` instead. Worth a line in the
   React Native section of the guide: every Expo Router app will hit this.
4. **Android: the link arrives twice.** With Chrome Custom Tabs, the redirect
   to the scheme produces one `url` event that both the app's listener and
   `expo-web-browser`'s polyfill observe, and `openAuthSessionAsync` resolves
   with the same URL. The app drops a link it saw in the last 60 s, and the
   journal makes a repeat harmless. The guide's "route the result of every
   auth-session open" advice is right, but hosts need the dedupe too.
5. **Android: automatic navigation to a custom scheme.** To verify on device.
   Chrome blocks a navigation to a custom scheme that does not follow a user
   gesture. The handoff follows the "Confirm in wallet" tap, so it should
   pass. The flow-end return "navigates once per outcome" without a tap, so
   it may be blocked on Android; the app refreshes status on foreground and
   on demand, so the receipt still arrives, but the Custom Tab stays open.
6. **iOS: two sheets per send.** The auth-session sheet closes on the handoff
   link; after the native send the app opens a second sheet for the resume
   link, and iOS asks for website-data consent again. Expected per the guide.
   To verify on device: whether the first sheet's dismissal animation and the
   app's own confirmation sheet overlap.
7. **The refund address.** The session has no field for it, so the app shows
   the wallet's external transparent address with a copy action before
   opening the pane. A `refundAddress` create parameter would remove a manual
   step.
8. **Status after a native send.** zingolib's `propose_send` pauses its sync
   engine until the stored proposal is sent or discarded. The app discards on
   decline, deadline, session end and forget, so the sync engine never stays
   paused.
9. **Deadline margin.** The app closes the confirmation sheet 30 s before the
   recorded deadline, matching the server's `past-deadline` window.

## Next steps that need a device

- Launch `zingo://0xramp` from the pane on iOS Safari (auth session) and
  Android Chrome (Custom Tab); confirm the handoff link reaches the app with
  all four parameters, then confirm the resume link reopens the pane with
  the fragment intact.
- Sign in by email on staging, with a throwaway account, in a fresh session.
  Do not confirm a deposit in the pane until the funded attempt is agreed.
- Confirm that `verifyZecSendHandoff` passes for the recorded request and
  refuses a hand-edited link.
