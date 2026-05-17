/**
 * VNX Paid Micro-Swarm — Typed Error Hierarchy
 */

export class SwarmError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SwarmError';
  }
}

export class PaymentError extends SwarmError {
  constructor(message: string, public readonly recipient?: string, public readonly amountHbar?: number) {
    super(message, 'PAYMENT_FAILED');
    this.name = 'PaymentError';
  }
}

export class VerificationError extends SwarmError {
  constructor(message: string, public readonly checks?: string[]) {
    super(message, 'VERIFICATION_FAILED');
    this.name = 'VerificationError';
  }
}

export class NetworkError extends SwarmError {
  constructor(message: string, public readonly retryable = false) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class AgentError extends SwarmError {
  constructor(message: string) {
    super(message, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}
