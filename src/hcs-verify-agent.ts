/**
 * Hiero HCS Verify Agent — Read submitted HCS messages and verify them against mirror node.
 *
 * This agent checks whether a proof message was actually published to an HCS topic
 * by querying the Hedera/Hiero mirror node REST API.
 */

import type { HcsProofMessage } from './hcs-publisher.js';
import { isCanonicalSequenceNumber } from './identity-gate.js';

export interface HcsVerifyReport {
  agentId: string;
  agentName: string;
  specialty: string;
  verdict: 'accepted' | 'rejected';
  summary: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  message?: HcsProofMessage;
}

export interface HcsTopicMessageResponse {
  messages: Array<{
    consensus_timestamp: string;
    message: string;
    sequence_number: number;
    topic_id: string;
  }>;
}

export class HieroHcsVerifyAgent {
  readonly agentId = 'hcs-verify-vnx';
  readonly agentName = 'Hiero HCS Verify VNX Agent';
  readonly specialty = 'hiero-hcs-proof';

  private _mirrorBaseUrl: string;

  constructor(mirrorBaseUrl?: string) {
    this._mirrorBaseUrl = mirrorBaseUrl ?? 'https://mainnet-public.mirrornode.hedera.com';
  }

  /**
   * Verify an HCS message by its topic ID and sequence number.
   */
  async verify(params: { topicId: string; sequenceNumber?: number | string | null }): Promise<HcsVerifyReport> {
    const checks: HcsVerifyReport['checks'] = [];

    // BIND 011: reject missing/non-canonical caller seq; do not mint identity from Mirror.
    if (!isCanonicalSequenceNumber(params.sequenceNumber)) {
      checks.push({
        name: 'caller_sequence_present',
        ok: false,
        detail: 'Missing or non-canonical caller sequence_number; refuse to mint identity from Mirror',
      });
      return this._buildReport(checks, null);
    }

    // 1. Fetch message from mirror node
    const url = `${this._mirrorBaseUrl}/api/v1/topics/${params.topicId}/messages/${params.sequenceNumber}`;
    let messageData: HcsTopicMessageResponse | null = null;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mirror node returned ${response.status}`);
      }
      messageData = (await response.json()) as HcsTopicMessageResponse;
      checks.push({
        name: 'mirror_node_fetch',
        ok: true,
        detail: `Fetched message from ${url}`,
      });
    } catch (err) {
      checks.push({
        name: 'mirror_node_fetch',
        ok: false,
        detail: `Failed to fetch from mirror node: ${(err as Error).message}`,
      });
      return this._buildReport(checks, null);
    }

    // 2. Check topic ID matches
    const msg = messageData.messages?.[0];
    if (!msg) {
      checks.push({
        name: 'message_exists',
        ok: false,
        detail: 'No message found at this sequence number',
      });
      return this._buildReport(checks, null);
    }

    checks.push({
      name: 'message_exists',
      ok: true,
      detail: `Message sequence ${msg.sequence_number} found`,
    });

    // 3. Verify topic ID
    const topicMatch = msg.topic_id === params.topicId;
    checks.push({
      name: 'topic_id_match',
      ok: topicMatch,
      detail: topicMatch
        ? `Topic ID matches ${params.topicId}`
        : `Topic ID mismatch: ${msg.topic_id} vs ${params.topicId}`,
    });

    // 4. Decode and validate message format
    let decoded: HcsProofMessage | null = null;
    try {
      const payload = Buffer.from(msg.message, 'base64').toString('utf8');
      decoded = JSON.parse(payload) as HcsProofMessage;
      const validFormat =
        decoded.type === 'vnx.swarm.proof' &&
        typeof decoded.taskHash === 'string' &&
        typeof decoded.decisionHash === 'string' &&
        typeof decoded.winner === 'string' &&
        typeof decoded.proofStatus === 'string';

      checks.push({
        name: 'message_format',
        ok: validFormat,
        detail: validFormat
          ? 'Valid vnx.swarm.proof message format'
          : 'Invalid message format or missing fields',
      });
    } catch (err) {
      checks.push({
        name: 'message_format',
        ok: false,
        detail: `Failed to decode message: ${(err as Error).message}`,
      });
    }

    // 5. Check consensus timestamp
    const hasTimestamp = !!msg.consensus_timestamp;
    checks.push({
      name: 'consensus_timestamp',
      ok: hasTimestamp,
      detail: hasTimestamp ? `Consensus at ${msg.consensus_timestamp}` : 'No consensus timestamp',
    });

    return this._buildReport(checks, decoded);
  }

  private _buildReport(
    checks: HcsVerifyReport['checks'],
    message: HcsProofMessage | null,
  ): HcsVerifyReport {
    const okCount = checks.filter(c => c.ok).length;
    const totalCount = checks.length;
    const allOk = okCount === totalCount;

    return {
      agentId: this.agentId,
      agentName: this.agentName,
      specialty: this.specialty,
      verdict: allOk ? 'accepted' : 'rejected',
      summary: `${okCount}/${totalCount} checks passed for HCS message`,
      checks,
      message: message ?? undefined,
    };
  }
}
