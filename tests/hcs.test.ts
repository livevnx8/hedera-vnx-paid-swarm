import { describe, it, expect } from '@jest/globals';
import { HcsTopicPublisher, DryRunHcsPublisher, HcsProofMessage } from '../src/hcs-publisher.js';
import { HieroHcsVerifyAgent, HcsTopicMessageResponse } from '../src/hcs-verify-agent.js';

describe('HcsTopicPublisher.buildMessage', () => {
  it('builds a valid vnx.swarm.proof message', () => {
    const msg = HcsTopicPublisher.buildMessage({
      taskHash: 'abc123',
      decisionHash: 'def456',
      winner: 'onnx-primary',
      proofStatus: 'mainnet_confirmed',
    });

    expect(msg.type).toBe('vnx.swarm.proof');
    expect(msg.taskHash).toBe('abc123');
    expect(msg.decisionHash).toBe('def456');
    expect(msg.winner).toBe('onnx-primary');
    expect(msg.proofStatus).toBe('mainnet_confirmed');
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.version).toBe('1.0.0');
  });
});

describe('DryRunHcsPublisher', () => {
  it('returns dry-run success without network calls', async () => {
    const publisher = new DryRunHcsPublisher('0.0.10416185');
    const msg: HcsProofMessage = {
      type: 'vnx.swarm.proof',
      taskHash: 'abc',
      decisionHash: 'def',
      winner: 'onnx-primary',
      proofStatus: 'mainnet_confirmed',
      timestamp: Date.now(),
      version: '1.0.0',
    };

    const result = await publisher.publish(msg);
    expect(result.status).toBe('success');
    expect(result.topicId).toBe('0.0.10416185');
    expect(result.sequenceNumber).toBe('DRY_RUN');
    expect(result.transactionId).toContain('dry-run');
  });
});

describe('HieroHcsVerifyAgent', () => {
  it('returns accepted verdict for a valid mirror-node response', async () => {
    const agent = new HieroHcsVerifyAgent('https://mock.mirror.node');

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () =>
          ({
            messages: [
              {
                consensus_timestamp: '1234567890.000000001',
                message: Buffer.from(
                  JSON.stringify({
                    type: 'vnx.swarm.proof',
                    taskHash: 'abc',
                    decisionHash: 'def',
                    winner: 'onnx-primary',
                    proofStatus: 'mainnet_confirmed',
                    timestamp: Date.now(),
                    version: '1.0.0',
                  }),
                ).toString('base64'),
                sequence_number: 42,
                topic_id: '0.0.10416185',
              },
            ],
          } as HcsTopicMessageResponse),
      }) as Response;

    const report = await agent.verify({ topicId: '0.0.10416185', sequenceNumber: 42 });

    expect(report.verdict).toBe('accepted');
    expect(report.agentId).toBe('hcs-verify-vnx');
    expect(report.checks.every((c) => c.ok)).toBe(true);

    globalThis.fetch = originalFetch;
  });

  it('returns rejected verdict when mirror node returns error', async () => {
    const agent = new HieroHcsVerifyAgent('https://mock.mirror.node');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 404,
        json: async () => ({ messages: [] }),
      }) as Response;

    const report = await agent.verify({ topicId: '0.0.10416185', sequenceNumber: 999 });

    expect(report.verdict).toBe('rejected');
    expect(report.checks.some((c) => !c.ok)).toBe(true);

    globalThis.fetch = originalFetch;
  });
});
