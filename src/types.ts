/**
 * VNX Paid Micro-Swarm — Shared Types
 */

import type { CallerIdentity, IdentityStatus } from './identity-gate.js';

export type { CallerIdentity, IdentityStatus } from './identity-gate.js';

export interface SwarmTask {
  id: string;
  description: string;
  timestamp: number;
}

export interface WorkerVote {
  workerId: string;
  name: string;
  specialty: string;
  recommendation: string;
  confidence: number;
  priceHbar: number;
  paymentAccount: string;
  evidence: string;
  score?: number;
}

export interface WorkerResult {
  workerId: string;
  name: string;
  specialty: string;
  recommendation: string;
  confidence: number;
  priceHbar: number;
  paymentAccount: string;
  evidence: string;
}

export interface PaymentResult {
  status: 'success' | 'payment_failed' | 'skipped_plan_only';
  transactionId?: string;
  network: string;
  amountHbar: number;
  recipient: string;
  consensusTimestampMs?: number;
  error?: string;
  identity_status?: IdentityStatus;
  caller_canonical_present?: boolean;
  manufactured?: boolean;
  mirror_bytes_match?: boolean;
}

export interface SwarmReceipt {
  version: string;
  network: string;
  timestamp: number;
  taskHash: string;
  votes: Array<{
    workerId: string;
    name: string;
    specialty: string;
    confidence: number;
    priceHbar: number;
    paymentAccount: string;
    score: number;
  }>;
  selected: {
    workerId: string;
    name: string;
    specialty: string;
    priceHbar: number;
    paymentAccount: string;
    score: number;
  };
  payment: PaymentResult;
  decisionHash: string;
  proofStatus: 'mainnet_confirmed' | 'not_mainnet_proof';
  explorerUrl?: string;
  mirrorNodeUrl?: string;
  identity_status?: IdentityStatus;
  caller_canonical_present?: boolean;
  manufactured?: boolean;
  mirror_bytes_match?: boolean;
}

export interface PaymentRail {
  transfer(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
    identity?: CallerIdentity,
  ): Promise<PaymentResult>;
}
