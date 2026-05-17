#!/usr/bin/env node
/**
 * Render a 30-second VNX mainnet proof demo GIF from live public data.
 *
 * This script reads public mirror-node / market data. It does not submit
 * payments or HCS messages.
 */

import { mkdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { fetchMainnetDemoData, renderMainnetDemoFrame } from '../src/mainnet-demo.js';

const program = new Command()
  .name('render-mainnet-demo')
  .description('Render a 30-second VNX paid swarm mainnet proof demo GIF')
  .option(
    '--transaction-id <id>',
    'Known Hedera mainnet payment transaction ID',
    '0.0.10294360@1778958335.880736678',
  )
  .option('--hcs-topic <id>', 'HCS topic ID to query for latest proof message', '0.0.10416185')
  .option('--hcs-sequence <n>', 'Specific HCS message sequence number')
  .option('--frames <n>', 'Number of frames to render', '90')
  .option('--fps <n>', 'GIF frame rate', '3')
  .option('--out <path>', 'Output GIF path', 'assets/vnx-mainnet-demo.gif')
  .option('--keep-frames', 'Keep generated SVG frame directory', false)
  .option('--preview', 'Render a single middle frame as SVG (no GIF encoding)', false)
  .option('--concurrency <n>', 'Max parallel SVG writes', '4')
  .parse();

const opts = program.opts<{
  transactionId: string;
  hcsTopic: string;
  hcsSequence?: string;
  frames: string;
  fps: string;
  out: string;
  keepFrames: boolean;
  preview: boolean;
  concurrency: string;
}>();

function checkFfmpeg(): void {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  if (result.error || result.status !== 0) {
    throw new Error(
      'ffmpeg is required but not found in PATH. Install ffmpeg (https://ffmpeg.org/download.html)',
    );
  }
}

function formatProgress(current: number, total: number): string {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `  Frame ${String(current).padStart(4, '0')}/${String(total).padStart(4, '0')} [${bar}] ${pct}%`;
}

async function writeFrame(dir: string, index: number, total: number, svg: string): Promise<void> {
  const path = join(dir, `frame-${String(index).padStart(4, '0')}.svg`);
  await writeFile(path, svg);
  const info = await stat(path);
  if (info.size < 100) {
    throw new Error(`Frame ${index} is malformed (${info.size} bytes): ${path}`);
  }
}

async function runInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  while (i < items.length) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map((item, batchIdx) => fn(item, i + batchIdx)));
    i += concurrency;
  }
}

async function main(): Promise<void> {
  const totalFrames = Number.parseInt(opts.frames, 10);
  const fps = Number.parseInt(opts.fps, 10);
  const concurrency = Number.parseInt(opts.concurrency, 10);
  const hcsSequence = opts.hcsSequence ? Number.parseInt(opts.hcsSequence, 10) : undefined;

  if (!Number.isInteger(totalFrames) || totalFrames < 2) {
    throw new Error('--frames must be an integer greater than 1');
  }
  if (!Number.isInteger(fps) || fps < 1) {
    throw new Error('--fps must be a positive integer');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('--concurrency must be a positive integer');
  }

  if (!opts.preview) {
    checkFfmpeg();
  }

  console.log('Fetching live public mainnet/demo data...');
  const data = await fetchMainnetDemoData({
    transactionId: opts.transactionId,
    hcsTopicId: opts.hcsTopic,
    hcsSequence,
  });

  const frameDir = 'assets/demo-frames';
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  await mkdir(dirname(opts.out), { recursive: true });

  if (opts.preview) {
    const previewIndex = Math.floor(totalFrames / 2);
    const svg = renderMainnetDemoFrame(data, previewIndex, totalFrames);
    const outPath = opts.out.endsWith('.svg') ? opts.out : opts.out.replace(/\.gif$/, '.svg');
    await writeFile(outPath, svg);
    await stat(outPath).then(info => {
      if (info.size < 100) throw new Error(`Preview frame is malformed (${info.size} bytes)`);
    });
    console.log(`\nPreview frame rendered: ${outPath}`);
    console.log(`  Frame index: ${previewIndex}/${totalFrames}`);
    console.log(`  Transaction: ${data.transactionId}`);
    console.log(
      `  HCS:         ${data.hcsTopicId} (${data.hcsStatus}${data.hcsSequence ? ` #${data.hcsSequence}` : ''})`,
    );
    console.log(
      '  Note: renderer reads public data only; it does not submit new payments or HCS messages.',
    );
    return;
  }

  let lastProgress = '';
  const indices = Array.from({ length: totalFrames }, (_, i) => i);

  console.log(`Rendering ${totalFrames} SVG frames (concurrency: ${concurrency})...`);
  await runInBatches(indices, concurrency, async i => {
    const frame = renderMainnetDemoFrame(data, i, totalFrames);
    await writeFrame(frameDir, i, totalFrames, frame);
    const progress = formatProgress(i + 1, totalFrames);
    if (progress !== lastProgress) {
      process.stdout.write(`\r${progress}`);
      lastProgress = progress;
    }
  });
  process.stdout.write('\n');

  console.log(`Encoding GIF with ffmpeg: ${opts.out}`);
  const ffmpeg = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      `${frameDir}/frame-%04d.svg`,
      '-vf',
      'scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      opts.out,
    ],
    { stdio: 'inherit' },
  );

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed with status ${ffmpeg.status}`);
  }

  if (!opts.keepFrames) {
    await rm(frameDir, { recursive: true, force: true });
  }

  console.log('\nMainnet demo GIF rendered.');
  console.log(`  Output:      ${opts.out}`);
  console.log(`  Transaction: ${data.transactionId}`);
  console.log(
    `  HCS:         ${data.hcsTopicId} (${data.hcsStatus}${data.hcsSequence ? ` #${data.hcsSequence}` : ''})`,
  );
  console.log(`  HBAR ticks:  ${data.hbarTicks.length}`);
  console.log(
    '  Note: renderer reads public data only; it does not submit new payments or HCS messages.',
  );
}

main().catch(err => {
  console.error('Demo render failed:', (err as Error).message);
  process.exit(1);
});
