/**
 * Hiero Verify VNX Agent
 *
 * Agent-style wrapper around the deterministic receipt verifier. This gives
 * proof verification a first-class VNX agent identity while keeping the hash
 * and mirror-node checks centralized in proof-verifier.ts.
 */

import { SwarmReceipt } from './types.js';
import { ProofCheck, ProofVerifierOptions, verifySwarmProof } from './proof-verifier.js';

export type HieroVerifyVerdict = 'accepted' | 'rejected';

export interface HieroVerifyAgentReport {
  agentId: 'hiero-verify-vnx';
  agentName: 'Hiero Verify VNX Agent';
  specialty: 'hiero-mainnet-proof';
  verdict: HieroVerifyVerdict;
  summary: string;
  checks: ProofCheck[];
  proof: {
    transactionId?: string;
    proofStatus: string;
    hashScanUrl?: string;
    mirrorNodeUrl?: string;
  };
}

export class HieroVerifyVnxAgent {
  readonly id = 'hiero-verify-vnx';
  readonly name = 'Hiero Verify VNX Agent';
  readonly specialty = 'hiero-mainnet-proof';

  constructor(private readonly _options: ProofVerifierOptions = {}) {}

  async verify(receipt: SwarmReceipt, taskDescription: string): Promise<HieroVerifyAgentReport> {
    const result = await verifySwarmProof(receipt, taskDescription, this._options);
    const passed = result.checks.filter(check => check.ok).length;
    const total = result.checks.length;

    return {
      agentId: this.id,
      agentName: this.name,
      specialty: this.specialty,
      verdict: result.ok ? 'accepted' : 'rejected',
      summary: `${passed}/${total} checks passed for transaction ${receipt.payment.transactionId ?? 'missing'}`,
      checks: result.checks,
      proof: {
        transactionId: receipt.payment.transactionId,
        proofStatus: receipt.proofStatus,
        hashScanUrl: receipt.explorerUrl,
        mirrorNodeUrl: receipt.mirrorNodeUrl,
      },
    };
  }
}
