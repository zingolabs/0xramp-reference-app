# 0xramp lightwallet

A reference Zcash lightwallet that shows how to integrate 0xramp's ZEC ↔ fiat
ramp. Its readers are wallet teams who copy the integration. It is not a
product for end users.

This glossary does not describe 0xramp's service. 0xramp's own objects keep
the names that its API gives them.

## Language

### Parties

**Lightwallet**:
The app: a Zcash wallet that holds its own keys and syncs from an indexer, not
from a full node.
_Avoid_: lightclient (zingolib's engine type, not the app)

**Indexer**:
The server that a lightwallet syncs from, for example zec.rocks.
_Avoid_: server, lightwalletd, node

**0xramp**:
The ramp provider: a non-custodial service that exchanges ZEC and local fiat
over peer-to-peer payment rails.
_Avoid_: swap provider

### Wallet

**Restore**:
Rebuilding a wallet from its seed phrase and its birthday. UI label: "Import".
_Avoid_: import (outside UI copy), recover

**Birthday**:
The block height where a wallet's history begins. A restore scans the chain
from this height.

### Funds

**Balance**:
The ZEC that the wallet can spend now. It does not include pending or
unshielded ZEC.
_Avoid_: total, available

**Pending**:
Incoming ZEC that the wallet sees but cannot spend yet.
_Avoid_: unconfirmed (a narrower chain term)

**Unshielded**:
ZEC that the wallet holds at transparent receivers. It is not part of the
balance until the user shields it.
_Avoid_: transparent balance

**Shield**:
The explicit user action that moves unshielded ZEC into the wallet's shielded
funds. Each shield is its own history entry.
_Avoid_: auto-shield, sweep

### Ramps

**Ramp**:
One exchange between ZEC and fiat through 0xramp, in either direction. It
starts when the user commits to it, not when the user sees a price. A ramp links to its
transactions; it is not a transaction.
_Avoid_: swap (a swap exchanges one crypto asset for another)

**Off-ramp**:
A ramp from ZEC to fiat: the user sells ZEC and receives local currency.
_Avoid_: withdrawal, cash-out

**On-ramp**:
A ramp from fiat to ZEC: the user pays local currency and receives ZEC.
UI label: "Add".
_Avoid_: deposit, top-up

**Corridor**:
One fiat currency together with the payment rail that moves it, for example
BRL via Pix. The user chooses the corridor at the start of each ramp.
_Avoid_: market, country, currency (one currency can have more than one rail)

**ZEC leg**:
The part of a ramp on the Zcash chain: the transactions between the wallet and
0xramp, a refund included. The wallet sees this leg directly.

**Fiat leg**:
The part of a ramp on the payment rail, for example the Pix payout. Only
0xramp knows its state.

### History

**History entry**:
One row in the transaction history: either one transaction, or one ramp with
all of its transactions. A restore from seed does not recover ramps. Their
transactions come back as plain entries.
_Avoid_: transaction (for a row; a ramp row can hold more than one)
