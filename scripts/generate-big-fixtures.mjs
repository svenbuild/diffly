// Generator: regenerates test-fixtures/directories text files with long lines
// and many lines so the compare view exercises large/wide content.
//
// Preserves files that must stay binary/large/identical semantically:
//   - binary.bin       : stays binary (untouched)
//   - real-jq.exe      : stays binary (untouched)
//   - real-topic.png   : stays image (untouched)
//   - same.txt         : identical on both sides, but now long
//   - too-large.txt    : still > 1 MB on both sides
//
// Run with: node scripts/generate-big-fixtures.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'test-fixtures', 'directories');
const LEFT = join(ROOT, 'left');
const RIGHT = join(ROOT, 'right');

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeText(abs, text) {
  ensureDir(dirname(abs));
  writeFileSync(abs, text, 'utf8');
}

// Deterministic pseudo-random so diffs are stable between runs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJECTIVES = [
  'orbital', 'crystalline', 'meandering', 'tessellated', 'reticulated',
  'synchronous', 'polyphonic', 'incandescent', 'interstellar', 'persistent',
  'chromatic', 'iridescent', 'granular', 'luminous', 'frictionless',
  'antiquated', 'bespoke', 'asynchronous', 'truncated', 'cascading',
  'flattened', 'collated', 'marshalled', 'filigreed', 'ephemeral',
  'contiguous', 'recursive', 'declarative', 'imperative', 'quiescent',
];
const NOUNS = [
  'workspace', 'manifest', 'pipeline', 'snapshot', 'hydration',
  'partition', 'scheduler', 'dispatcher', 'observer', 'accumulator',
  'telemetry', 'trajectory', 'resonator', 'collator', 'configurator',
  'aggregator', 'projection', 'bookkeeper', 'cartographer', 'navigator',
  'compositor', 'transducer', 'envelope', 'channel', 'buffer',
  'inventory', 'chronicle', 'archivist', 'preamble', 'anthology',
];
const VERBS = [
  'iterates', 'hydrates', 'rebalances', 'collates', 'renumbers',
  'aligns', 'fans out', 'pivots', 'rewires', 'synthesizes',
  'harmonizes', 'materializes', 'normalizes', 'recomposes', 'ingests',
  'shepherds', 'mediates', 'broadcasts', 'coalesces', 'partitions',
];
const OBJECTS = [
  'the changed blocks', 'the unified hunks', 'the side-by-side rows',
  'the filter chips', 'the sidebar entries', 'the minimap preview',
  'the virtualized viewport', 'the throttled wheel events',
  'the horizontal scroll sync', 'the collapsed tree branches',
  'the pinned bottom scrollbar', 'the binary hex rows',
  'the image diff overlay', 'the too-large status banner',
  'the inline highlight fragments', 'the gutter line numbers',
  'the wrapped line-text spans', 'the context row decorations',
  'the summary cards', 'the workspace filter pills',
];

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

function randomChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function wideLine(rng, label, index) {
  const chunks = [];
  while (chunks.join(' ').length < 280) {
    const adj = randomChoice(rng, ADJECTIVES);
    const noun = randomChoice(rng, NOUNS);
    const verb = randomChoice(rng, VERBS);
    const obj = randomChoice(rng, OBJECTS);
    chunks.push(`the ${adj} ${noun} ${verb} ${obj}`);
  }
  return `${label} ${pad(index, 5)} :: ${chunks.join(' | ')}`;
}

function longNarrativeLines(count, seed, label) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push(wideLine(rng, label, i));
  return out;
}

// ─── block-rewrite.ts ───────────────────────────────────────────────────────
function buildBlockRewrite(side) {
  const isRight = side === 'right';
  const header = [
    'export interface ComparePanelState {',
    '  id: string;',
    '  title: string;',
    '  expanded: boolean;',
    '  activeFilters: string[];',
    '  selectedPath: string;',
    '  summaryLines: string[];',
    '}',
    '',
    'export const baselinePanels: ComparePanelState[] = [',
  ];
  const panels = [];
  const panelCount = 18;
  for (let i = 0; i < panelCount; i++) {
    const suffix = isRight && i % 7 === 3 ? ', rightOnly' : '';
    const filters = isRight && i % 5 === 0
      ? `["modified", "leftOnly", "rightOnly"]`
      : `["modified", "leftOnly"]`;
    const sideWord = isRight ? 'right' : 'left';
    panels.push(
      `  {`,
      `    id: "panel-${pad(i, 3)}",`,
      `    title: "Panel ${pad(i, 3)} ${isRight ? 'updated' : 'baseline'}${suffix}",`,
      `    expanded: ${i % 3 === 0 ? 'true' : 'false'},`,
      `    activeFilters: ${filters},`,
      `    selectedPath: "nested/src/module-${pad(i, 3)}.c",`,
      `    summaryLines: [`,
      `      "Panel ${pad(i, 3)} summary (${sideWord}) :: this ${isRight ? 'rewritten' : 'baseline'} entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",`,
      `      "Panel ${pad(i, 3)} detail (${sideWord}) :: the ${isRight ? 'updated' : 'original'} phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",`,
      `    ],`,
      `  },`,
    );
  }
  const footer = [
    '];',
    '',
    'export function renderPanelSummary(panels: ComparePanelState[]) {',
    '  return panels.map((panel) => {',
    '    return [',
    '      `panel ${panel.id}`,',
    '      `title ${panel.title}`,',
    '      `expanded ${panel.expanded}`,',
    '      `filters ${panel.activeFilters.join(", ")}`,',
    '      `selected ${panel.selectedPath}`,',
    '      ...panel.summaryLines,',
    '    ].join("\\n");',
    '  });',
    '}',
    '',
    'export const baselineNarrative = [',
  ];
  const narrative = longNarrativeLines(40, isRight ? 2002 : 1001, isRight ? 'right narrative' : 'left narrative');
  const narrativeBody = narrative.map((line) => `  ${JSON.stringify(line)},`);
  const closer = [
    '];',
    '',
    'export const baselineReport = renderPanelSummary(baselinePanels).join("\\n\\n");',
    '',
  ];
  return [...header, ...panels, ...footer, ...narrativeBody, ...closer].join('\n');
}

// ─── case-only.txt ─────────────────────────────────────────────────────────
function buildCaseOnly(side) {
  const rng = mulberry32(4242);
  const lines = [];
  const total = 140;
  for (let i = 0; i < total; i++) {
    const base = wideLine(rng, 'case fixture line', i);
    lines.push(side === 'right' ? base.toUpperCase() : base);
  }
  return lines.join('\n') + '\n';
}

// ─── delete-block.md ───────────────────────────────────────────────────────
function buildDeleteBlock(side) {
  const rng = mulberry32(7);
  const lines = [];
  lines.push('# Delete Block Fixture');
  lines.push('');
  lines.push('This fixture exercises contiguous delete blocks under large viewer payloads.');
  lines.push('');
  for (let section = 0; section < 6; section++) {
    lines.push(`## Section ${pad(section, 3)}`);
    lines.push('');
    for (let p = 0; p < 6; p++) {
      lines.push(wideLine(rng, `delete-block paragraph ${section}/${p}`, section * 100 + p));
    }
    // Left side has an extra block every few sections that right removes.
    if (side === 'left' && section % 2 === 0) {
      lines.push('');
      lines.push(`### Legacy subsection ${pad(section, 3)}`);
      lines.push('');
      for (let k = 0; k < 5; k++) {
        lines.push(wideLine(rng, `legacy-only paragraph ${section}/${k}`, section * 1000 + k));
      }
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// ─── inline-change.css ─────────────────────────────────────────────────────
function buildInlineChange(side) {
  const rng = mulberry32(123);
  const out = [];
  out.push('/* Inline-change fixture: many selectors with occasional word-level swaps. */');
  out.push('');
  const total = 120;
  for (let i = 0; i < total; i++) {
    const adj = randomChoice(rng, ADJECTIVES);
    const noun = randomChoice(rng, NOUNS);
    const verb = randomChoice(rng, VERBS);
    const obj = randomChoice(rng, OBJECTS);
    const colorLeft = '#1a2b3c';
    const colorRight = '#4f6a7b';
    const color = side === 'right' && i % 37 === 0 ? colorRight : colorLeft;
    const word = side === 'right' && i % 53 === 0 ? 'modified' : 'baseline';
    out.push(
      `.${adj}-${noun}-${pad(i, 4)} { `
      + `color: ${color}; `
      + `font-family: "${noun} ${adj}", ${adj} mono, system-ui; `
      + `content: "${word} :: ${verb} ${obj} across the compare viewer ${pad(i, 4)}"; `
      + `transform: translate3d(${i % 17}px, ${i % 13}px, 0) rotate(${i % 7}deg) scale(${1 + (i % 5) * 0.01}); `
      + `--annotation: "${wideLine(rng, 'inline-css annotation', i).slice(0, 220)}"; `
      + `}`,
    );
  }
  return out.join('\n') + '\n';
}

// ─── insert-block.md ───────────────────────────────────────────────────────
function buildInsertBlock(side) {
  const rng = mulberry32(11);
  const lines = [];
  lines.push('# Insert Block Fixture');
  lines.push('');
  lines.push('This fixture exercises contiguous insert blocks rendered after matching context.');
  lines.push('');
  for (let section = 0; section < 6; section++) {
    lines.push(`## Chapter ${pad(section, 3)}`);
    lines.push('');
    for (let p = 0; p < 6; p++) {
      lines.push(wideLine(rng, `insert-block paragraph ${section}/${p}`, section * 100 + p));
    }
    if (side === 'right' && section % 2 === 1) {
      lines.push('');
      lines.push(`### New subsection ${pad(section, 3)}`);
      lines.push('');
      for (let k = 0; k < 6; k++) {
        lines.push(wideLine(rng, `right-only inserted paragraph ${section}/${k}`, section * 1000 + k));
      }
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// ─── left-only.txt ─────────────────────────────────────────────────────────
function buildLeftOnly() {
  const rng = mulberry32(808);
  const out = [];
  out.push('This file exists only on the left side of the compare fixture.');
  out.push('');
  for (let i = 0; i < 140; i++) {
    out.push(wideLine(rng, 'left-only narrative', i));
  }
  return out.join('\n') + '\n';
}

// ─── right-only.txt ────────────────────────────────────────────────────────
function buildRightOnly() {
  const rng = mulberry32(909);
  const out = [];
  out.push('This file exists only on the right side of the compare fixture.');
  out.push('');
  for (let i = 0; i < 140; i++) {
    out.push(wideLine(rng, 'right-only narrative', i));
  }
  return out.join('\n') + '\n';
}

// ─── punctuation-inline.json ───────────────────────────────────────────────
function buildPunctuationInline(side) {
  const rng = mulberry32(333);
  const entries = [];
  const total = 70;
  for (let i = 0; i < total; i++) {
    const sentence = wideLine(rng, 'punctuation entry', i);
    const leftPunct = sentence.replace(/ :: /, ' - ').replace(/\./g, ';');
    const rightPunct = sentence.replace(/ :: /, ' — ').replace(/\./g, '.');
    entries.push({
      id: `entry-${pad(i, 5)}`,
      index: i,
      label: `Punctuation sample ${pad(i, 5)}`,
      message: side === 'right' ? rightPunct : leftPunct,
      tags: ['fixture', 'punctuation', side, `bucket-${i % 7}`],
    });
  }
  return JSON.stringify({ generatedBy: 'generate-big-fixtures', side, entries }, null, 2) + '\n';
}

// ─── same.txt ──────────────────────────────────────────────────────────────
function buildSame() {
  // Identical content on both sides.
  const rng = mulberry32(314159);
  const out = [];
  out.push('// same.txt :: content is identical on both sides of the compare.');
  out.push('');
  for (let i = 0; i < 150; i++) {
    out.push(wideLine(rng, 'same-both-sides', i));
  }
  return out.join('\n') + '\n';
}

// ─── whitespace-only.txt ───────────────────────────────────────────────────
function buildWhitespaceOnly(side) {
  const rng = mulberry32(271828);
  const out = [];
  for (let i = 0; i < 140; i++) {
    const line = wideLine(rng, 'whitespace-only variant', i);
    if (side === 'right') {
      // Collapse or expand runs of spaces; preserve word order.
      const tweaked = i % 2 === 0
        ? line.replace(/ \| /g, '  |  ')
        : line.replace(/ {2,}/g, ' ');
      out.push(tweaked);
    } else {
      out.push(line);
    }
  }
  return out.join('\n') + '\n';
}

// ─── too-large.txt ─────────────────────────────────────────────────────────
function buildTooLarge(side) {
  const rng = mulberry32(side === 'right' ? 9000 : 8000);
  const out = [];
  // Stay comfortably over the 1 MB ceiling so the TooLarge path triggers.
  const total = 3600;
  for (let i = 0; i < total; i++) {
    out.push(wideLine(rng, `too-large ${side} line`, i));
  }
  return out.join('\n') + '\n';
}

// ─── nested/src/module.c ───────────────────────────────────────────────────
function buildModuleC(side) {
  const rng = mulberry32(51);
  const out = [];
  out.push('#include <stdio.h>');
  out.push('#include <stdlib.h>');
  out.push('#include <string.h>');
  out.push('');
  out.push('/* Large module.c fixture exercising wide lines in the diff viewer. */');
  out.push('');
  const fnCount = 14;
  for (let i = 0; i < fnCount; i++) {
    const annotation = wideLine(rng, `comment block ${pad(i, 3)}`, i);
    out.push(`/* ${annotation} */`);
    const suffix = side === 'right' && i % 9 === 4 ? '_v2' : '';
    out.push(`static int process_segment_${pad(i, 3)}${suffix}(const char *input, size_t length, char *output, size_t capacity, int flags, int threshold) {`);
    out.push(`  size_t written = 0;`);
    out.push(`  /* ${wideLine(rng, `inline note ${pad(i, 3)}`, i + 100)} */`);
    for (let step = 0; step < 6; step++) {
      const tweak = side === 'right' && step === 2 && i % 5 === 0 ? ' + 1' : '';
      out.push(`  for (size_t idx_${step} = 0; idx_${step} < length; idx_${step}++) {`);
      out.push(`    if (written + ${step}${tweak} >= capacity) { return (int)written; }`);
      out.push(`    output[written++] = (char)(input[idx_${step}] ^ (int)(flags & ${0xff - step * 7}) ^ threshold);`);
      out.push(`  }`);
    }
    out.push(`  return (int)written;`);
    out.push(`}`);
    out.push('');
  }
  out.push('int main(int argc, char **argv) {');
  out.push('  (void)argc; (void)argv;');
  out.push(`  char buffer[4096];`);
  out.push(`  const char *payload = "${wideLine(rng, 'main-payload', 1).slice(0, 260)}";`);
  out.push(`  return process_segment_000(payload, strlen(payload), buffer, sizeof(buffer), ${side === 'right' ? 0x55 : 0x33}, ${side === 'right' ? 9 : 7});`);
  out.push('}');
  return out.join('\n') + '\n';
}

// ─── nested/docs/reordered-notes.md ────────────────────────────────────────
function buildReorderedNotes(side) {
  const rng = mulberry32(77);
  const sections = [];
  for (let i = 0; i < 8; i++) {
    const body = [];
    body.push(`## Note ${pad(i, 3)}`);
    body.push('');
    for (let p = 0; p < 4; p++) {
      body.push(wideLine(rng, `note ${pad(i, 3)} paragraph ${p}`, i * 50 + p));
    }
    body.push('');
    sections.push(body.join('\n'));
  }
  if (side === 'right') {
    // Reorder: reverse pairs so the right side has a shuffled order.
    for (let i = 0; i + 1 < sections.length; i += 2) {
      const tmp = sections[i];
      sections[i] = sections[i + 1];
      sections[i + 1] = tmp;
    }
  }
  return sections.join('\n') + '\n';
}

// ─── nested/include/{legacy_only,new_only}.h ──────────────────────────────
function buildHeader(prefix, seed) {
  const rng = mulberry32(seed);
  const out = [];
  out.push(`#ifndef ${prefix.toUpperCase()}_H`);
  out.push(`#define ${prefix.toUpperCase()}_H`);
  out.push('');
  for (let i = 0; i < 60; i++) {
    out.push(`/* ${wideLine(rng, `${prefix} declaration`, i)} */`);
    out.push(`int ${prefix}_entry_${pad(i, 4)}(const char *input_${pad(i, 4)}, size_t length_${pad(i, 4)}, char *output_${pad(i, 4)}, size_t capacity_${pad(i, 4)}, int flags_${pad(i, 4)}, int threshold_${pad(i, 4)});`);
  }
  out.push('');
  out.push(`#endif /* ${prefix.toUpperCase()}_H */`);
  return out.join('\n') + '\n';
}

// ─── nested/deep/tree/{left,right}-extra.txt ──────────────────────────────
function buildDeepExtra(side) {
  const rng = mulberry32(side === 'right' ? 501 : 401);
  const out = [];
  out.push(`This file is ${side}-only inside nested/deep/tree.`);
  out.push('');
  for (let i = 0; i < 100; i++) {
    out.push(wideLine(rng, `${side}-extra line`, i));
  }
  return out.join('\n') + '\n';
}

// ─── write all files ──────────────────────────────────────────────────────
const writes = [];

function pair(relative, leftBuilder, rightBuilder) {
  writes.push([join(LEFT, relative), leftBuilder]);
  writes.push([join(RIGHT, relative), rightBuilder]);
}

function leftOnlyFile(relative, builder) {
  writes.push([join(LEFT, relative), builder]);
}

function rightOnlyFile(relative, builder) {
  writes.push([join(RIGHT, relative), builder]);
}

pair('block-rewrite.ts', () => buildBlockRewrite('left'), () => buildBlockRewrite('right'));
pair('case-only.txt', () => buildCaseOnly('left'), () => buildCaseOnly('right'));
pair('delete-block.md', () => buildDeleteBlock('left'), () => buildDeleteBlock('right'));
pair('inline-change.css', () => buildInlineChange('left'), () => buildInlineChange('right'));
pair('insert-block.md', () => buildInsertBlock('left'), () => buildInsertBlock('right'));
leftOnlyFile('left-only.txt', buildLeftOnly);
rightOnlyFile('right-only.txt', buildRightOnly);
pair('punctuation-inline.json', () => buildPunctuationInline('left'), () => buildPunctuationInline('right'));
pair('same.txt', buildSame, buildSame);
pair('whitespace-only.txt', () => buildWhitespaceOnly('left'), () => buildWhitespaceOnly('right'));
pair('too-large.txt', () => buildTooLarge('left'), () => buildTooLarge('right'));
pair('nested/src/module.c', () => buildModuleC('left'), () => buildModuleC('right'));
pair('nested/docs/reordered-notes.md', () => buildReorderedNotes('left'), () => buildReorderedNotes('right'));
leftOnlyFile('nested/include/legacy_only.h', () => buildHeader('legacy', 601));
rightOnlyFile('nested/include/new_only.h', () => buildHeader('new', 602));
leftOnlyFile('nested/deep/tree/left-extra.txt', () => buildDeepExtra('left'));
rightOnlyFile('nested/deep/tree/right-extra.txt', () => buildDeepExtra('right'));

for (const [abs, builder] of writes) {
  const content = builder();
  writeText(abs, content);
  const bytes = Buffer.byteLength(content, 'utf8');
  const lines = content.split('\n').length - 1;
  console.log(`wrote ${abs.replace(ROOT, '…')}  ${bytes.toLocaleString()} B  ${lines} lines`);
}
