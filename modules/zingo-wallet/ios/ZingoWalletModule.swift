import ExpoModulesCore

private let walletDirectory = URL.applicationSupportDirectory.appending(path: "zingo-wallet", directoryHint: .isDirectory)

private let sharedWallet = Result<Wallet, Error> {
  let wallet = try Wallet(walletDir: walletDirectory.path, indexerUri: "https://zec.rocks:443")
  var directory = walletDirectory
  var backupExclusion = URLResourceValues()
  backupExclusion.isExcludedFromBackup = true
  try directory.setResourceValues(backupExclusion)
  return wallet
}

public final class ZingoWalletModule: Module {
  public func definition() -> ModuleDefinition {
    let syncStateForwarder = SyncStateForwarder(module: self)

    Name("ZingoWallet")
    Events("onSyncState")

    AsyncFunction("exists") { try await withWallet { try await $0.exists() } }
    AsyncFunction("create") { try await withWallet { try await $0.create() } }
    AsyncFunction("restore") { (seedPhrase: String, birthday: Int64) in
      try await withWallet { try await $0.restore(seedPhrase: seedPhrase, birthday: birthday) }
    }
    AsyncFunction("load") { try await withWallet { try await $0.load() } }
    AsyncFunction("deleteWallet") { try await withWallet { try await $0.delete() } }
    AsyncFunction("balance") { try await withWallet { try await $0.balance() }.dictionary }
    AsyncFunction("history") { try await withWallet { try await $0.history() }.map(\.dictionary) }
    AsyncFunction("startSync") { try await withWallet { try await $0.startSync(listener: syncStateForwarder) } }
    AsyncFunction("pauseSync") { try await withWallet { try await $0.pauseSync() } }
    AsyncFunction("resumeSync") { try await withWallet { try await $0.resumeSync() } }
  }
}

private final class SyncStateForwarder: SyncListener, @unchecked Sendable {
  private weak var module: ZingoWalletModule?

  init(module: ZingoWalletModule) {
    self.module = module
  }

  func onSyncState(state: SyncState) {
    module?.sendEvent("onSyncState", state.dictionary)
  }
}

private final class WalletErrorException: Exception, @unchecked Sendable {
  private let walletCode: String
  private let walletReason: String

  init(_ error: WalletError) {
    walletCode = error.code()
    walletReason = error.reason()
    super.init()
  }

  override var code: String { walletCode }
  override var reason: String { walletReason }
}

private func withWallet<T>(_ body: (Wallet) async throws -> T) async throws -> T {
  do {
    return try await body(sharedWallet.get())
  } catch let error as WalletError {
    throw WalletErrorException(error)
  }
}

private extension Balance {
  var dictionary: [String: Any] {
    ["spendableZats": spendableZats, "unshieldedZats": unshieldedZats]
  }
}

private extension HistoryEntry {
  var dictionary: [String: Any] {
    ["txid": txid, "kind": kind.jsName, "zats": zats, "timestampMs": timestampMs, "pending": pending]
  }
}

private extension SyncState {
  var dictionary: [String: Any?] {
    ["phase": phase.jsName, "firstSyncComplete": firstSyncComplete, "errorCode": errorCode, "errorReason": errorReason]
  }
}

private extension HistoryKind {
  var jsName: String {
    switch self {
    case .received: "received"
    case .sent: "sent"
    case .shielded: "shielded"
    }
  }
}

private extension SyncPhase {
  var jsName: String {
    switch self {
    case .idle: "idle"
    case .syncing: "syncing"
    case .synced: "synced"
    case .paused: "paused"
    case .failed: "failed"
    }
  }
}
