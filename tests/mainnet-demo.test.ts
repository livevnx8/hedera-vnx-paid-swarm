/**
 * Mainnet demo data/rendering tests
 */

import { jest } from '@jest/globals';
import {
  fetchMainnetDemoData,
  renderMainnetDemoFrame,
} from '../src/mainnet-demo.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('mainnet demo data', () => {
  it('fetches transaction, HCS topic, and HBAR ticks from injected live-data endpoints', async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes('/transactions/0.0.10294360-1778958335-880736678')) {
        return jsonResponse({
          transactions: [{
            result: 'SUCCESS',
            transaction_id: '0.0.10294360-1778958335-880736678',
            consensus_timestamp: '1778958341.300569000',
          }],
        });
      }
      if (url.includes('/topics/0.0.10416185/messages')) {
        return jsonResponse({
          messages: [{
            sequence_number: 7,
            consensus_timestamp: '1778958400.000000001',
            topic_id: '0.0.10416185',
          }],
        });
      }
      if (url.includes('api.coingecko.com')) {
        return jsonResponse({
          prices: [
            [1, 0.0505],
            [2, 0.0510],
          ],
        });
      }
      return jsonResponse({}, false, 404);
    }) as unknown as typeof fetch;

    const data = await fetchMainnetDemoData({
      transactionId: '0.0.10294360@1778958335.880736678',
      hcsTopicId: '0.0.10416185',
      fetchFn,
    });

    expect(data.transactionResult).toBe('SUCCESS');
    expect(data.mirrorTransactionId).toBe('0.0.10294360-1778958335-880736678');
    expect(data.hcsStatus).toBe('verified');
    expect(data.hcsSequence).toBe(7);
    expect(data.hbarTicks).toHaveLength(2);
    expect(data.hashScanUrl).toContain('hashscan.io/mainnet/transaction');
    expect(data.dataProvenance.source).toBe('CoinGecko API (public)');
    expect(data.dataProvenance.sampleCount).toBe(2);
    expect(data.dataProvenance.dataHash).toHaveLength(16);
  });

  it('renders a self-contained SVG frame with proof and HCS labels', () => {
    const svg = renderMainnetDemoFrame({
      transactionId: '0.0.10294360@1778958335.880736678',
      hashScanUrl: 'https://hashscan.io/mainnet/transaction/x',
      mirrorTransactionId: '0.0.10294360-1778958335-880736678',
      transactionResult: 'SUCCESS',
      transactionConsensusTimestamp: '1778958341.300569000',
      hcsTopicId: '0.0.10416185',
      hcsStatus: 'verified',
      hcsSequence: 7,
      hcsConsensusTimestamp: '1778958400.000000001',
      hbarTicks: [
        { time: 1, price: 0.0505 },
        { time: 2, price: 0.051 },
      ],
      dataProvenance: {
        source: 'CoinGecko API (public)',
        fetchedAt: '2026-05-17T11:00:00.000Z',
        dataHash: 'a1b2c3d4e5f67890',
        sampleCount: 2,
      },
      benchmark: {
        predictionsPerSecond: 88975.28,
        receiptBuildOpsPerSecond: 416466.94,
        verifierOpsPerSecond: 295338.7,
      },
    }, 10, 90);

    expect(svg).toContain('<svg');
    expect(svg).toContain('VNX Paid Micro-Swarm');
    expect(svg).toContain('HBAR/USD Public Market Feed');
    expect(svg).toContain('0.0.10416185 #7');
    expect(svg).toContain('ACCEPTED');
    expect(svg).toContain('Real mainnet transaction');
  });
});
