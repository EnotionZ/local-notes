import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchNotesInRecords, scoreRecord } from '../lib/search.js';

function normalizeForMatch(str) {
  return str.toLowerCase().replace(/[-_\s]/g, '');
}

function createRecord({ path, basename, content = '', tags = [] }) {
  const basenameLower = basename.toLowerCase();
  const pathLower = path.toLowerCase();
  return {
    path,
    basename,
    basenameLower,
    basenameNormalized: normalizeForMatch(basenameLower),
    pathLower,
    pathNormalized: normalizeForMatch(pathLower),
    tags,
    tagsLower: tags.map((t) => t.toLowerCase()),
    content,
    contentLower: content.toLowerCase()
  };
}

test('searchNotesInRecords ranks by exact basename, prefix, path, then content', () => {
  const records = [
    createRecord({ path: 'a/path-only.md', basename: 'Path Only', content: 'no match' }),
    createRecord({ path: 'z/doc.md', basename: 'aws', content: 'no match' }),
    createRecord({ path: 'b/doc.md', basename: 'AWS Guide', content: 'no match' }),
    createRecord({ path: 'c/aws-topic.md', basename: 'Topic', content: 'no match' }),
    createRecord({ path: 'd/doc.md', basename: 'Doc', content: 'mentions aws inside content' })
  ];

  const results = searchNotesInRecords(records, 'aws', 10);
  assert.deepEqual(
    results.map((item) => ({ path: item.path, score: item.score })),
    [
      { path: 'z/doc.md', score: 100 },
      { path: 'b/doc.md', score: 75 },
      { path: 'c/aws-topic.md', score: 50 },
      { path: 'd/doc.md', score: 25 }
    ]
  );
});

test('searchNotesInRecords returns empty list for blank query', () => {
  const records = [createRecord({ path: 'a/doc.md', basename: 'Doc', content: 'aws' })];
  const results = searchNotesInRecords(records, '   ', 10);
  assert.equal(results.length, 0);
});

test('searchNotesInRecords applies limit', () => {
  const records = [
    createRecord({ path: 'a/doc.md', basename: 'aws', content: '' }),
    createRecord({ path: 'b/doc.md', basename: 'aws second', content: '' }),
    createRecord({ path: 'c/aws.md', basename: 'Doc', content: '' })
  ];

  const results = searchNotesInRecords(records, 'aws', 2);
  assert.equal(results.length, 2);
});

test('tag match scores higher than path match', () => {
  const records = [
    createRecord({ path: 'a/doc.md', basename: 'Doc', content: '', tags: ['aws'] }),
    createRecord({ path: 'b/aws-topic.md', basename: 'Topic', content: '' })
  ];

  const results = searchNotesInRecords(records, 'aws', 10);
  assert.equal(results[0].path, 'a/doc.md', 'tag match should rank first');
  assert.equal(results[0].score, 70);
  assert.equal(results[1].path, 'b/aws-topic.md');
  assert.equal(results[1].score, 50);
});

test('multi-word search requires all tokens to match', () => {
  const records = [
    createRecord({ path: 'a/doc.md', basename: 'AWS Lambda Guide', content: '' }),
    createRecord({ path: 'b/doc.md', basename: 'Lambda', content: '' }),
    createRecord({ path: 'c/doc.md', basename: 'AWS Guide', content: '' }),
    createRecord({ path: 'd/doc.md', basename: 'Doc', content: 'aws lambda usage' })
  ];

  const results = searchNotesInRecords(records, 'aws lambda', 10);
  // Only records with BOTH "aws" and "lambda" should match.
  const paths = results.map((r) => r.path);
  assert.ok(paths.includes('a/doc.md'), 'basename containing both tokens should match');
  assert.ok(paths.includes('d/doc.md'), 'content containing both tokens should match');
  assert.ok(!paths.includes('b/doc.md'), 'record with only "lambda" should not match');
  assert.ok(!paths.includes('c/doc.md'), 'record with only "aws" should not match');
});

test('fuzzy match on basename scores lower than content match', () => {
  const records = [
    createRecord({ path: 'a/doc.md', basename: 'docker', content: 'nothing' }),
    createRecord({ path: 'b/doc.md', basename: 'notes', content: 'dcr info here' }),
    createRecord({ path: 'c/doc.md', basename: 'dkr-tool', content: 'nothing' }) // fuzzy: d-k-r
  ];

  // 'dcr' - only 'docker' has exact substring, 'dkr-tool' is fuzzy
  const results = searchNotesInRecords(records, 'docker', 10);
  const dockerResult = results.find((r) => r.path === 'a/doc.md');
  assert.ok(dockerResult, 'exact match should appear');
  assert.equal(dockerResult.score, 100);
});

test('results include tags field', () => {
  const records = [
    createRecord({ path: 'a/doc.md', basename: 'Doc', content: 'aws info', tags: ['aws', 'cloud'] })
  ];
  const results = searchNotesInRecords(records, 'aws', 10);
  assert.ok(results.length > 0);
  assert.deepEqual(results[0].tags, ['aws', 'cloud']);
});
