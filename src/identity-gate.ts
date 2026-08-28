/**
 * VNX Paid Micro-Swarm — Caller identity gate (I-HCS-ID-009 / I-HCS-RAIL-010 bind)
 *
 * Classify caller sequence_number. Mirror verifies a claimed canonical integer;
 * it must not mint a missing one. Do not copy Mirror sequence onto the caller.
 */

export type IdentityStatus = 'resolved' | 'unresolved' | 'disagreement';

export interface CallerIdentity {
  sequence_number?: unknown;
  claimed_location?: unknown;
  mirror_sequence?: unknown;
  identity_status?: IdentityStatus;
  caller_canonical_present?: boolean;
  manufactured?: boolean;
  mirror_bytes_match?: boolean;
}

export interface ResolvedCallerIdentity {
  identity_status: IdentityStatus;
  caller_canonical_present: boolean;
  manufactured: boolean;
  mirror_bytes_match: boolean;
  canonical: string | null;
  reason: 'CONSENSUS_IDENTITY_UNRESOLVED' | 'CONSENSUS_LOCATION_DISAGREEMENT' | null;
}

/** Canonical integer loc: finite integer >= 1, or digit-only string (not "120.0"). */
export function isCanonicalSequenceNumber(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return false;
  if (typeof v === 'number') {
    return Number.isFinite(v) && v >= 1 && Math.floor(v) === v;
  }
  const s = String(v).trim();
  if (!/^[0-9]+$/.test(s)) return false;
  return s !== '0';
}

/**
 * Resolve identity_status from caller seq + claimed loc / mirror seq.
 * Missing/stripped/null/undefined/non-canonical → unresolved.
 * Caller integer ≠ claimed loc → disagreement.
 * "120" and 120 match as the same loc when both canonical.
 */
export function resolveCallerIdentity(input?: CallerIdentity | null): ResolvedCallerIdentity {
  const unresolved = (manufactured: boolean): ResolvedCallerIdentity => ({
    identity_status: 'unresolved',
    caller_canonical_present: false,
    manufactured,
    mirror_bytes_match: false,
    canonical: null,
    reason: 'CONSENSUS_IDENTITY_UNRESOLVED',
  });

  if (input == null) return unresolved(false);

  const hasSeqProp = Object.prototype.hasOwnProperty.call(input, 'sequence_number');
  const callerSeqRaw = hasSeqProp ? input.sequence_number : undefined;
  const claimedRaw =
    input.claimed_location !== undefined && input.claimed_location !== null
      ? input.claimed_location
      : input.mirror_sequence;
  const callerSeqSupplied = callerSeqRaw !== undefined && callerSeqRaw !== null && callerSeqRaw !== '';
  const mirrorSeqPresent = isCanonicalSequenceNumber(claimedRaw);

  if (callerSeqSupplied && !isCanonicalSequenceNumber(callerSeqRaw)) {
    return unresolved(false);
  }

  if (
    isCanonicalSequenceNumber(callerSeqRaw) &&
    isCanonicalSequenceNumber(claimedRaw) &&
    String(callerSeqRaw) !== String(claimedRaw)
  ) {
    return {
      identity_status: 'disagreement',
      caller_canonical_present: true,
      manufactured: false,
      mirror_bytes_match: false,
      canonical: null,
      reason: 'CONSENSUS_LOCATION_DISAGREEMENT',
    };
  }

  if (!isCanonicalSequenceNumber(callerSeqRaw)) {
    return unresolved(!!mirrorSeqPresent);
  }

  if (
    isCanonicalSequenceNumber(callerSeqRaw) &&
    isCanonicalSequenceNumber(claimedRaw) &&
    String(callerSeqRaw) === String(claimedRaw)
  ) {
    return {
      identity_status: 'resolved',
      caller_canonical_present: true,
      manufactured: false,
      mirror_bytes_match: true,
      canonical: String(callerSeqRaw),
      reason: null,
    };
  }

  // Caller canonical integer present but Mirror did not verify matching loc.
  // 007 byte-binding: do not AUTHORIZE transfer without Mirror bytes match.
  return {
    identity_status: 'unresolved',
    caller_canonical_present: true,
    manufactured: false,
    mirror_bytes_match: false,
    canonical: null,
    reason: 'CONSENSUS_IDENTITY_UNRESOLVED',
  };
}

export function identityBlocksPayment(resolved: ResolvedCallerIdentity): boolean {
  return resolved.identity_status === 'unresolved' || resolved.identity_status === 'disagreement';
}

export function sixthCheckOk(resolved: {
  identity_status?: IdentityStatus | null;
  caller_canonical_present?: boolean;
  manufactured?: boolean;
  mirror_bytes_match?: boolean;
}): boolean {
  return (
    resolved.identity_status === 'resolved' &&
    !!resolved.caller_canonical_present &&
    !!resolved.mirror_bytes_match &&
    !resolved.manufactured
  );
}
