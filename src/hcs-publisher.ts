/**
 * HCS Topic Publisher — Publish compact proof events to a Hedera Consensus Service topic.
 *
 * This is a standalone utility for anchoring swarm proof receipts on-chain.
 * It does not claim infinite throughput — it proves settlement and audit anchoring.
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  TopicId,
  AccountId,
  PrivateKey,
} from '@hashgraph/sdk';

export interface HcsProofMessage {
  type: 'vnx.swarm.proof';
  taskHash: string;
  decisionHash: string;
  winner: string;
  proofStatus: string;
  timestamp: number;
  version: string;
}

export interface HcsPublishResult {
  status: 'success' | 'failed';
  sequenceNumber?: string;
  topicId: string;
  transactionId?: string;
  consensusTimestamp?: string;
  error?: string;
}

export interface HcsPublisherConfig {
  topicId: string;
  accountId: string;
  privateKey: string;
  network?: string;
}

export class HcsTopicPublisher {
  private _client: Client;
  private _topicId: TopicId;
  private _accountId: AccountId;

  constructor(config: HcsPublisherConfig) {
    const network = config.network ?? 'mainnet';
    this._client = Client.forName(network as 'mainnet' | 'testnet' | 'previewnet');
    this._client.setOperator(
      AccountId.fromString(config.accountId),
      PrivateKey.fromStringECDSA(config.privateKey),
    );
    this._topicId = TopicId.fromString(config.topicId);
    this._accountId = AccountId.fromString(config.accountId);
  }

  /**
   * Publish a compact proof message to the HCS topic.
   * @param message The proof message payload
   * @returns Publish result with sequence number and tx id
   */
  async publish(message: HcsProofMessage): Promise<HcsPublishResult> {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(this._topicId)
        .setMessage(JSON.stringify(message));

      const response = await tx.execute(this._client);
      const receipt = await response.getReceipt(this._client);
      const record = await response.getRecord(this._client);

      return {
        status: 'success',
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        topicId: this._topicId.toString(),
        transactionId: response.transactionId.toString(),
        consensusTimestamp: record.consensusTimestamp?.toDate().toISOString(),
      };
    } catch (err) {
      return {
        status: 'failed',
        topicId: this._topicId.toString(),
        error: (err as Error).message,
      };
    }
  }

  /**
   * Build a compact proof message from a swarm receipt.
   */
  static buildMessage(params: {
    taskHash: string;
    decisionHash: string;
    winner: string;
    proofStatus: string;
  }): HcsProofMessage {
    return {
      type: 'vnx.swarm.proof',
      taskHash: params.taskHash,
      decisionHash: params.decisionHash,
      winner: params.winner,
      proofStatus: params.proofStatus,
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }

  close(): void {
    this._client.close();
  }
}

/**
 * Dry-run publisher that logs to console instead of hitting the network.
 */
export class DryRunHcsPublisher {
  private _topicId: string;

  constructor(topicId: string) {
    this._topicId = topicId;
  }

  async publish(message: HcsProofMessage): Promise<HcsPublishResult> {
    console.log(`[DRY RUN] Would publish to topic ${this._topicId}:`);
    console.log(JSON.stringify(message, null, 2));
    return {
      status: 'success',
      topicId: this._topicId,
      sequenceNumber: 'DRY_RUN',
      transactionId: `dry-run@${Date.now()}`,
    };
  }

  close(): void {
    // noop
  }
}
