import { describe, it, expect } from '@jest/globals';
import { VnxPredictionFirehose, formatFirehoseSummary } from '../src/firehose.js';

describe('VnxPredictionFirehose', () => {
  it('runs 100 tasks and returns throughput metrics', async () => {
    const firehose = new VnxPredictionFirehose();
    const result = await firehose.run({ tasks: 100 });

    expect(result.taskCount).toBe(100);
    expect(result.totalMs).toBeGreaterThan(0);
    expect(result.predictionsPerSecond).toBeGreaterThan(0);
    expect(result.receiptsPerSecond).toBeGreaterThan(0);
    expect(result.verifierChecksPerSecond).toBeGreaterThan(0);
    expect(result.totalSimulatedHbar).toBeGreaterThan(0);
    expect(result.topWorkers.length).toBeGreaterThan(0);
  });

  it('throws for invalid task counts', async () => {
    const firehose = new VnxPredictionFirehose();
    await expect(firehose.run({ tasks: 0 })).rejects.toThrow(/positive integer/);
    await expect(firehose.run({ tasks: -1 })).rejects.toThrow(/positive integer/);
    await expect(firehose.run({ tasks: 1.5 })).rejects.toThrow(/positive integer/);
  });
});

describe('formatFirehoseSummary', () => {
  it('formats a firehose result as a readable string', () => {
    const result = {
      taskCount: 1000,
      totalMs: 1234.56,
      predictionsPerSecond: 809.55,
      receiptsPerSecond: 400.0,
      verifierChecksPerSecond: 350.0,
      topWorkers: [
        { workerId: 'onnx-primary', wins: 500 },
        { workerId: 'onnx-secondary', wins: 300 },
      ],
      totalSimulatedHbar: 5.0,
    };

    const output = formatFirehoseSummary(result);
    expect(output).toContain('VNX Prediction Firehose');
    expect(output).toContain('Tasks:');
    expect(output).toContain('onnx-primary');
    expect(output).toContain('500 wins');
    expect(output).toContain('No Hedera network calls were made');
  });
});
