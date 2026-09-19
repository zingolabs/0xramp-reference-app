import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Platform = "ios" | "android";

const root = join(import.meta.dirname, "..");
const rustDir = join(root, "rust");
const targetDir = join(rustDir, "target");
const bindingsDir = join(targetDir, "uniffi");
const moduleDir = join(root, "modules", "zingo-wallet");
const iosModuleDir = join(moduleDir, "ios");
const androidMainDir = join(moduleDir, "android", "src", "main");

const crateName = "zingo-wallet-ffi";
const libraryName = "zingo_wallet_ffi";
const ffiModuleName = "zingo_wallet_ffiFFI";
const xcframeworkName = "ZingoWalletFFI.xcframework";
const iosDeploymentTarget = "16.4";
const iosTargets = ["aarch64-apple-ios", "aarch64-apple-ios-sim"];
const androidAbis = ["arm64-v8a", "x86_64"];
const androidTargets = ["aarch64-linux-android", "x86_64-linux-android"];
const androidPlatform = "24";
const ndkVersion = "28.2.13676358";

function fail(message: string): never {
  console.error(`\nbuild-rust: ${message}`);
  process.exit(1);
}

function capture(command: string, args: string[]): string | undefined {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0 ? result.stdout : undefined;
}

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: rustDir, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.error) fail(`could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args[0]} failed with exit code ${result.status ?? result.signal}`);
}

function timed(label: string, step: () => void): void {
  const start = Date.now();
  step();
  console.log(`\n${label} finished in ${((Date.now() - start) / 1000).toFixed(0)} s`);
}

function parsePlatforms(args: string[]): Platform[] {
  const requested = args[0] ?? "all";
  if (args.length > 1 || !["ios", "android", "all"].includes(requested)) {
    fail("usage: node scripts/build-rust.mts [ios|android|all]");
  }
  return requested === "all" ? ["ios", "android"] : [requested as Platform];
}

function readToolchain(): string {
  const toolchainFile = join(rustDir, "rust-toolchain.toml");
  if (!existsSync(toolchainFile)) fail(`${toolchainFile} not found; the Rust workspace is missing`);
  const channel = readFileSync(toolchainFile, "utf8").match(/channel\s*=\s*"([^"]+)"/)?.[1];
  return channel ?? fail(`no channel in ${toolchainFile}`);
}

function ndkHome(): string {
  return process.env.ANDROID_NDK_HOME ?? join(homedir(), "Library", "Android", "sdk", "ndk", ndkVersion);
}

function ndkRevision(ndk: string): string | undefined {
  const properties = join(ndk, "source.properties");
  if (!existsSync(properties)) return undefined;
  return readFileSync(properties, "utf8").match(/Pkg\.Revision\s*=\s*(\S+)/)?.[1];
}

function checkTools(platforms: Platform[], toolchain: string): void {
  const problems: string[] = [];
  const requiredTargets = platforms.flatMap((platform) => (platform === "ios" ? iosTargets : androidTargets));

  if (capture("rustup", ["--version"]) === undefined) {
    problems.push("rustup not found. Install it from https://rustup.rs");
  } else if (!capture("rustup", ["toolchain", "list"])?.split("\n").some((line) => line.startsWith(`${toolchain}-`))) {
    problems.push(`Rust toolchain ${toolchain} is not installed. Run: rustup toolchain install ${toolchain}`);
  } else {
    const installed = capture("rustup", ["target", "list", "--toolchain", toolchain, "--installed"])?.split("\n") ?? [];
    const missing = requiredTargets.filter((target) => !installed.includes(target));
    if (missing.length > 0) {
      problems.push(`Rust targets missing for ${toolchain}. Run: rustup target add --toolchain ${toolchain} ${missing.join(" ")}`);
    }
  }

  if (capture("protoc", ["--version"]) === undefined) {
    problems.push("protoc not found. Install Protocol Buffers, for example: brew install protobuf");
  }

  if (platforms.includes("ios")) {
    if (process.platform !== "darwin") {
      problems.push("iOS builds need macOS with Xcode");
    } else if (capture("xcodebuild", ["-version"]) === undefined) {
      problems.push("xcodebuild not found. Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app");
    }
  }

  if (platforms.includes("android")) {
    if (capture("cargo", ["ndk", "--version"]) === undefined) {
      problems.push("cargo-ndk not found. Run: cargo install cargo-ndk");
    }
    const revision = ndkRevision(ndkHome());
    if (revision !== ndkVersion) {
      problems.push(
        `Android NDK ${ndkVersion} (r28c) not found at ${ndkHome()}${revision ? ` (found ${revision})` : ""}. ` +
          `Install it with the Android Studio SDK Manager or: sdkmanager "ndk;${ndkVersion}", or set ANDROID_NDK_HOME`,
      );
    }
  }

  if (problems.length > 0) {
    fail(["missing build tools:", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
  }
}

function generateBindings(toolchain: string, library: string, language: "swift" | "kotlin", outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  run(
    "cargo",
    ["run", "--manifest-path", join(rustDir, "Cargo.toml"), "-p", "uniffi-bindgen", "--bin", "uniffi-bindgen", "--",
      "generate", "--library", library, "--language", language, "--out-dir", outDir, "--no-format", "--metadata-no-deps"],
    { RUSTUP_TOOLCHAIN: toolchain },
  );
}

function buildIos(toolchain: string): void {
  for (const target of iosTargets) {
    run(
      "cargo",
      ["rustc", "--manifest-path", join(rustDir, "Cargo.toml"), "-p", crateName, "--lib", "--release",
        "--target", target, "--crate-type", "staticlib"],
      { RUSTUP_TOOLCHAIN: toolchain, IPHONEOS_DEPLOYMENT_TARGET: iosDeploymentTarget },
    );
  }

  const staticLibraries = iosTargets.map((target) => join(targetDir, target, "release", `lib${libraryName}.a`));
  const swiftDir = join(bindingsDir, "swift");
  generateBindings(toolchain, staticLibraries[0], "swift", swiftDir);

  const headersDir = join(bindingsDir, "headers");
  const moduleHeadersDir = join(headersDir, ffiModuleName);
  rmSync(headersDir, { recursive: true, force: true });
  mkdirSync(moduleHeadersDir, { recursive: true });
  copyFileSync(join(swiftDir, `${ffiModuleName}.h`), join(moduleHeadersDir, `${ffiModuleName}.h`));
  copyFileSync(join(swiftDir, `${ffiModuleName}.modulemap`), join(moduleHeadersDir, "module.modulemap"));

  const xcframework = join(bindingsDir, xcframeworkName);
  rmSync(xcframework, { recursive: true, force: true });
  run("xcodebuild", [
    "-create-xcframework",
    ...staticLibraries.flatMap((library) => ["-library", library, "-headers", headersDir]),
    "-output", xcframework,
  ]);

  const installedXcframework = join(iosModuleDir, xcframeworkName);
  const generatedSwiftDir = join(iosModuleDir, "Generated");
  rmSync(installedXcframework, { recursive: true, force: true });
  rmSync(generatedSwiftDir, { recursive: true, force: true });
  cpSync(xcframework, installedXcframework, { recursive: true });
  mkdirSync(generatedSwiftDir, { recursive: true });
  copyFileSync(join(swiftDir, `${libraryName}.swift`), join(generatedSwiftDir, `${libraryName}.swift`));
}

function buildAndroid(toolchain: string): void {
  const jniLibsDir = join(androidMainDir, "jniLibs");
  rmSync(jniLibsDir, { recursive: true, force: true });
  run(
    "cargo",
    ["ndk", ...androidAbis.flatMap((abi) => ["-t", abi]), "--platform", androidPlatform, "-o", jniLibsDir,
      "rustc", "-p", crateName, "--lib", "--release", "--crate-type", "cdylib"],
    { RUSTUP_TOOLCHAIN: toolchain, ANDROID_NDK_HOME: ndkHome() },
  );

  for (const abi of androidAbis) {
    const library = join(jniLibsDir, abi, `lib${libraryName}.so`);
    if (!existsSync(library)) fail(`cargo ndk did not produce ${library}`);
  }

  const kotlinDir = join(bindingsDir, "kotlin");
  generateBindings(toolchain, join(targetDir, androidTargets[0], "release", `lib${libraryName}.so`), "kotlin", kotlinDir);

  const installedKotlinDir = join(androidMainDir, "java", "uniffi");
  rmSync(installedKotlinDir, { recursive: true, force: true });
  cpSync(join(kotlinDir, "uniffi"), installedKotlinDir, { recursive: true });
}

const platforms = parsePlatforms(process.argv.slice(2));
const toolchain = readToolchain();
checkTools(platforms, toolchain);

for (const platform of platforms) {
  timed(`${platform} build`, () => (platform === "ios" ? buildIos(toolchain) : buildAndroid(toolchain)));
}
