/**
 * Hedera Client — Minimal wrapper for @hashgraph/sdk
 * Supports HBAR transfers, balance queries, and client setup from env vars.
 */

import {
  Client,
  AccountId,
  PrivateKey,
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
  HbarUnit,
  Status,
} from '@hashgraph/sdk';

export interface HederaClientConfig {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet' | 'previewnet';
}

export interface HbarAccountBalance {
  hbar: number;
  tokens: Record<string, number>;
  timestamp: number;
}

export interface HbarTransferResult {
  transactionId: string;
  status: string;
  consensusTimestampMs: number;
}

/**
 * Low-level Hedera client wrapper for HBAR transfers and balance queries.
 * Handles SDK client setup, operator configuration, and connection cleanup.
 *
 * @example
 * const client = HederaClient.fromEnv();
 * const result = await client?.transferHbar('0.0.12345', 0.01, 'memo');
 * client?.close();
 */
export class HederaClient {
  private readonly _client: Client;
  private readonly _accountId: AccountId;
  private readonly _privateKey: PrivateKey;

  constructor(config: HederaClientConfig) {
    this._accountId = AccountId.fromString(config.accountId);
    this._privateKey = PrivateKey.fromStringECDSA(config.privateKey);

    switch (config.network) {
      case 'mainnet':
        this._client = Client.forMainnet();
        break;
      case 'testnet':
        this._client = Client.forTestnet();
        break;
      case 'previewnet':
        this._client = Client.forPreviewnet();
        break;
    }

    this._client.setOperator(this._accountId, this._privateKey);
    this._client.setDefaultMaxTransactionFee(new Hbar(2));
    this._client.setDefaultMaxQueryPayment(new Hbar(1));
  }

  /** Fetch HBAR balance for the configured account */
  async getBalance(accountId?: string): Promise<HbarAccountBalance> {
    const id = accountId ? AccountId.fromString(accountId) : this._accountId;
    const balance = await new AccountBalanceQuery().setAccountId(id).execute(this._client);

    const tokens: Record<string, number> = {};
    if (balance.tokens) {
      for (const [tokenId, amount] of balance.tokens) {
        tokens[tokenId.toString()] = amount.toNumber();
      }
    }

    return {
      hbar: balance.hbars.to(HbarUnit.Hbar).toNumber(),
      tokens,
      timestamp: Date.now(),
    };
  }

  /** Transfer HBAR from operator account to a recipient */
  async transferHbar(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
  ): Promise<HbarTransferResult> {
    const tx = new TransferTransaction()
      .addHbarTransfer(this._accountId, new Hbar(-amountHbar))
      .addHbarTransfer(AccountId.fromString(toAccountId), new Hbar(amountHbar));

    if (memo) tx.setTransactionMemo(memo);

    const signedTx = await tx.sign(this._privateKey);
    const response = await signedTx.execute(this._client);
    const receipt = await response.getReceipt(this._client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status === Status.Success ? 'success' : receipt.status.toString(),
      consensusTimestampMs: Date.now(),
    };
  }

  /** Close client connections */
  close(): void {
    this._client.close();
  }

  /** Build client from environment variables (returns null if vars missing) */
  static fromEnv(): HederaClient | null {
    const accountId = process.env['HEDERA_ACCOUNT_ID'];
    const privateKey = process.env['HEDERA_PRIVATE_KEY'];
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as HederaClientConfig['network'];
    if (!accountId || !privateKey) return null;
    try {
      return new HederaClient({ accountId, privateKey, network });
    } catch (err) {
      console.warn(`[HederaClient] Failed to init: ${(err as Error).message}`);
      return null;
    }
  }
}
