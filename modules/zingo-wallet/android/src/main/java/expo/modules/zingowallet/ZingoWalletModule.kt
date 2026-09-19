package expo.modules.zingowallet

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.lang.ref.WeakReference
import uniffi.zingo_wallet_ffi.Balance
import uniffi.zingo_wallet_ffi.HistoryEntry
import uniffi.zingo_wallet_ffi.HistoryKind
import uniffi.zingo_wallet_ffi.SyncListener
import uniffi.zingo_wallet_ffi.SyncPhase
import uniffi.zingo_wallet_ffi.SyncState
import uniffi.zingo_wallet_ffi.Wallet
import uniffi.zingo_wallet_ffi.WalletException

class ZingoWalletModule : Module() {
  private val wallet: Wallet
    get() {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      return SharedWallet.get(File(context.noBackupFilesDir, "zingo-wallet"))
    }

  override fun definition() = ModuleDefinition {
    Name("ZingoWallet")
    Events("onSyncState")

    AsyncFunction("exists") Coroutine { -> coded { wallet.exists() } }
    AsyncFunction("create") Coroutine { -> coded { wallet.create() } }
    AsyncFunction("restore") Coroutine { seedPhrase: String, birthday: Long -> coded { wallet.restore(seedPhrase, birthday) } }
    AsyncFunction("load") Coroutine { -> coded { wallet.load() } }
    AsyncFunction("deleteWallet") Coroutine { -> coded { wallet.delete() } }
    AsyncFunction("balance") Coroutine { -> coded { wallet.balance().toMap() } }
    AsyncFunction("history") Coroutine { -> coded { wallet.history().map { it.toMap() } } }
    AsyncFunction("startSync") Coroutine { -> coded { wallet.startSync(SyncStateForwarder(this@ZingoWalletModule)) } }
    AsyncFunction("pauseSync") Coroutine { -> coded { wallet.pauseSync() } }
    AsyncFunction("resumeSync") Coroutine { -> coded { wallet.resumeSync() } }
  }
}

private object SharedWallet {
  private var wallet: Wallet? = null

  @Synchronized
  fun get(directory: File): Wallet = wallet ?: Wallet(directory.path, "https://zec.rocks:443").also { wallet = it }
}

private class SyncStateForwarder(module: ZingoWalletModule) : SyncListener {
  private val module = WeakReference(module)

  override fun onSyncState(state: SyncState) {
    runCatching { module.get()?.sendEvent("onSyncState", state.toMap()) }
  }
}

private inline fun <T> coded(block: () -> T): T =
  try {
    block()
  } catch (error: WalletException) {
    throw CodedException(error.code(), error.reason(), error)
  }

private fun Balance.toMap() = mapOf("spendableZats" to spendableZats, "unshieldedZats" to unshieldedZats)

private fun HistoryEntry.toMap() =
  mapOf("txid" to txid, "kind" to kind.jsName(), "zats" to zats, "timestampMs" to timestampMs, "pending" to pending)

private fun SyncState.toMap() =
  mapOf("phase" to phase.jsName(), "firstSyncComplete" to firstSyncComplete, "errorCode" to errorCode, "errorReason" to errorReason)

private fun HistoryKind.jsName() =
  when (this) {
    HistoryKind.RECEIVED -> "received"
    HistoryKind.SENT -> "sent"
    HistoryKind.SHIELDED -> "shielded"
  }

private fun SyncPhase.jsName() =
  when (this) {
    SyncPhase.IDLE -> "idle"
    SyncPhase.SYNCING -> "syncing"
    SyncPhase.SYNCED -> "synced"
    SyncPhase.PAUSED -> "paused"
    SyncPhase.FAILED -> "failed"
  }
