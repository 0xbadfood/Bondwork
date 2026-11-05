// The named index: an entry is admitted only when its structure, its book formula, its stereo and its IUPAC name agree.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {entryErrors, lookup, mergeEntries, slug, type Entry} from '../src/index.ts';

const entry = (o: Partial<Entry>): Entry => ({id: '', name: 'x', aliases: [], iupac: '', formula: '', smiles: 'C', kind: 'molecule',
  sources: [{book: 'kech2-03', blocks: ['B1'], pages: [1]}], ...o});

test('an entry whose structure, book formula and name agree is admitted', () => {
  assert.deepEqual(entryErrors(entry({name: 'acetic acid', iupac: 'ethanoic acid', formula: 'CH3COOH', smiles: 'CC(=O)O'}), 'CC(=O)O'), []);
  assert.deepEqual(entryErrors(entry({name: 'tert-butyl carbocation', formula: '(CH3)3C^+', smiles: 'C[C+](C)C', kind: 'intermediate'})), []);
});

test('a structure that is not what the book prints is refused, saying so', () => {
  const [p] = entryErrors(entry({name: 'ethanol', formula: 'C2H5OH', smiles: 'CC'}));
  assert.match(p, /the structure is C2H6 but the book prints C2H5OH/);
});

test('a stereo name needs stereo in the SMILES', () => {
  assert.match(entryErrors(entry({name: 'cis-but-2-ene', iupac: '(2Z)-but-2-ene', smiles: 'CC=CC'}))[0], /leaves it open/);
  assert.deepEqual(entryErrors(entry({name: 'cis-but-2-ene', iupac: '(2Z)-but-2-ene', smiles: 'C/C=C\\C'})), []);
  assert.deepEqual(entryErrors(entry({name: 'butane', iupac: 'butane', smiles: 'CCCC'})), [], 'no stereo words, no stereo needed');
});

test('OPSIN reading the IUPAC name as another structure refuses the entry', () => {
  assert.match(entryErrors(entry({name: 'isobutane', iupac: 'butane', smiles: 'CC(C)C'}), 'CCCC')[0], /is CCCC, not this structure/);
  assert.match(entryErrors(entry({name: 'x', iupac: 'nonsense-ane', smiles: 'C'}), null)[0], /cannot read/);
});

test('entries merge by structure, keeping every name and source; lookup by any name', () => {
  const index = mergeEntries([
    entry({name: 'acetic acid', iupac: 'ethanoic acid', smiles: 'CC(=O)O', sources: [{book: 'kech2-02', blocks: ['B4'], pages: [3]}]}),
    entry({name: 'ethanoic acid', smiles: 'OC(C)=O', formula: 'CH3COOH', sources: [{book: 'kech2-03', blocks: ['B9'], pages: [7]}]}),
    entry({name: 'benzene', smiles: 'c1ccccc1'})]);
  assert.equal(index.length, 2);
  const acid = lookup(index, 'Ethanoic Acid')!;
  assert.equal(acid.id, 'acetic-acid');
  assert.equal(acid.formula, 'CH3COOH');
  assert.deepEqual(acid.sources.map(s => s.book), ['kech2-02', 'kech2-03']);
  assert.equal(lookup(index, 'C1=CC=CC=C1')!.name, 'benzene');
  assert.equal(slug('(2E)-But-2-ene'), '2e-but-2-ene');
});
