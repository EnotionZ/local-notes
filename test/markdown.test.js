import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, extractHeadings } from '../lib/markdown.js';

test('extractHeadings decodes HTML entities for TOC labels', () => {
  const html = renderMarkdown('## R&D & Ops');
  const headings = extractHeadings(html);

  assert.equal(headings.length, 1);
  // markdown-it encodes & as &amp; in heading text
  assert.equal(headings[0].text, 'R&amp;D &amp; Ops');
});
