# uniffi bindings behind a thin Expo module

The app reaches zingolib through uniffi-generated Swift and Kotlin bindings, called from a thin local Expo module. We do not use uniffi-bindgen-react-native (ubrn), although it generates the whole JS bridge. Wallet logic, async work and threading stay in the Rust FFI crate. The Swift and Kotlin code only forwards calls and events.

## Considered Options

- **ubrn (generated Turbo Module + JSI).** Rejected. The bindings exist only for JS. A future native background-sync worker could not call Rust without a second generation. Exported Rust code runs on the JS thread unless Rust moves it off. ubrn pins one uniffi minor version and a separate npm runtime that must be kept in step by hand. It has no official Expo path, and its CI does not build Android.
- **Classic React Native native modules (as in zingo-mobile).** Rejected. They run on the New Architecture only through the interop layer.

## Consequences

- The Expo Modules API is the only Expo-specific native code. If the app leaves Expo, only this adapter changes.
- Android loads the bindings through JNA.
