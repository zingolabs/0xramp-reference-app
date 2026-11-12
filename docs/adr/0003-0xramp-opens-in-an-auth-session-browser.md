# 0xramp opens in an auth session browser

The Add button opens `https://0xramp.app` with `WebBrowser.openAuthSessionAsync`, which is `ASWebAuthenticationSession` on iOS and a Chrome Custom Tab on Android. The app does not host the ramp in a WebView.

0xramp signs users in with a thirdweb in-app wallet. Its passkey is a WebAuthn credential whose relying party is `0xramp.app`, and its client code refuses to run if the page origin is not that host. Only a real browser engine can create and assert that credential.

## Considered Options

- **`react-native-webview`.** Rejected. Android WebView does not support passkeys; it needs a native Credential Manager bridge. iOS `WKWebView` allows WebAuthn only with the Associated Domains entitlement `webcredentials:0xramp.app`, which also needs an `apple-app-site-association` file from 0xramp that names this app. 0xramp serves no such file. A split flow (WebView for the ramp, system browser for login) fails too, because the session does not cross between the two.
- **An iframe on the web target.** Rejected. 0xramp sends `x-frame-options: DENY` and `frame-ancestors 'none'`.
- **Native passkey login with the thirdweb SDK.** Rejected for now. thirdweb in-app wallets are scoped by client ID. A login under our own client ID reaches a different account. This needs 0xramp to run a thirdweb ecosystem wallet and to issue a partner ID.

## Consequences

- The user sees browser chrome, not our UI. The sheet is tinted with the app colors.
- The session is not ephemeral. A returning user stays signed in to 0xramp and passkey autofill works. iOS asks for consent to share website data each time the sheet opens.
- The session page comes from the 0xramp partner API, and the deposit is a send request that 0xramp hands to the app on the return scheme. ADR 0004 describes that flow.
- A return URL on the app scheme is passed to the session. The sheet closes by itself each time 0xramp navigates to that scheme, so the app reopens the page in a new sheet after a send.
