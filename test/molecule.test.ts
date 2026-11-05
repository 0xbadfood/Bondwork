// The molecule core: structures read from SMILES, with formula, charge, lone pairs and stereo worked out and checked.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {hill, molecule, moleculeErrors, moleculeProps, moleculeScene} from '../src/index.ts';

test('formulas in Hill order, with the charge', () => {
  assert.equal(molecule('CCO').formula, 'C2H6O');
  assert.equal(molecule('CC(=O)[O-]').formula, 'C2H3O2-');
  assert.equal(molecule('c1ccccc1').formula, 'C6H6');
  assert.equal(molecule('[NH4+]').formula, 'H4N+');
  assert.equal(molecule('CCO', {hydrogens: true}).formula, 'C2H6O');
  assert.equal(hill('CH3CH2OH'), 'C2H6O');
  assert.equal(hill('SO4^2-'), 'O4S2-');
  assert.equal(hill('NH4+'), 'H4N+');
});

test('lone pairs from the valence electrons left over', () => {
  const pairs = (s: string, el: string) => molecule(s).atoms.find(a => a.el === el)!.pairs;
  assert.equal(pairs('CCO', 'O'), 2);
  assert.equal(pairs('C#N', 'N'), 1);
  assert.equal(pairs('N', 'N'), 1);
  assert.equal(pairs('[NH4+]', 'N'), 0);
  assert.equal(pairs('O', 'O'), 2);
  assert.deepEqual(molecule('CC(=O)[O-]').atoms.filter(a => a.el === 'O').map(a => a.pairs).sort(), [2, 3]);
});

test('stereo: E/Z on double bonds, R/S at centres, wedges drawn from the centre', () => {
  assert.equal(molecule('C/C=C\\C').bonds.find(b => b.order === 2)!.cip, 'Z');
  assert.equal(molecule('C/C=C/C').bonds.find(b => b.order === 2)!.cip, 'E');
  assert.equal(molecule('C[C@H](O)CC').atoms.find(a => a.cip)!.cip, 'S');
  assert.equal(molecule('N[C@@H](C)C(=O)O').atoms.find(a => a.cip)!.cip, 'S');   // L-alanine is S
  const m = molecule('C[C@H](O)CC'), w = m.bonds.find(b => b.stereo)!;
  assert.ok(m.atoms[w.a].cip, 'the narrow end of a wedge is the stereo centre');
  assert.equal(molecule('CC=CC').bonds.find(b => b.order === 2)!.cip, undefined);
});

test('the same molecule written two ways has one canonical SMILES', () => {
  assert.equal(molecule('OCC').smiles, molecule('C(O)C').smiles);
  assert.notEqual(molecule('CCCC').smiles, molecule('CC(C)C').smiles);
});

test('guards: a wrong formula or charge is named; a bad SMILES is refused', () => {
  assert.deepEqual(moleculeErrors(molecule('CCO'), {formula: 'C2H5OH'}), []);
  assert.match(moleculeErrors(molecule('CCO'), {formula: 'C2H4O'})[0], /formula is C2H6O/);
  assert.match(moleculeErrors(molecule('CC(=O)[O-]'), {charge: 0})[0], /charge is -1/);
  assert.deepEqual(moleculeErrors(molecule('[CH3+]')), []);
  assert.throws(() => molecule('C(C'), /not a molecule/);
  assert.throws(() => molecule('C(C)(C)(C)(C)C'), /not a molecule/);   // five bonds on carbon
});

test('benzene, skeletal: six corners, three inner second lines, no symbols', () => {
  const props = moleculeProps(molecule('c1ccccc1'), {style: 'skeletal'});
  assert.equal(props.filter(p => p.type === 'line' && !String(p.id).endsWith('-2')).length, 6);
  assert.equal(props.filter(p => String(p.id).endsWith('-2')).length, 3);
  assert.equal(props.filter(p => p.type === 'text').length, 0);
});

test('a structural formula writes every atom; hydrogens go on the free side', () => {
  const props = moleculeProps(molecule('CCO'), {style: 'structural'});
  assert.equal(props.filter(p => p.type === 'text' && !String(p.id).includes('-h')).length, 3);
  assert.deepEqual(props.filter(p => String(p.id).endsWith('-h')).map(p => p.text).sort(), ['H', 'H₂', 'H₃']);
});

// Linkwork checks the drawn scenes when it sits beside this repo (or LINKWORK points to it)
const LW = process.env.LINKWORK ?? join(import.meta.dirname, '../../linkwork');
test('drawn scenes pass Linkwork\'s checks: nothing off stage, no text on text', {skip: !existsSync(join(LW, 'src/index.ts'))}, async () => {
  const lw = await import(join(LW, 'src/index.ts'));
  for (const [s, style, extra] of [['C/C=C\\C', 'skeletal', ''], ['N[C@@H](C)C(=O)O', 'skeletal', 'L'], ['CCO', 'structural', 'HP'],
    ['CC(=O)[O-]', 'structural', 'P'], ['C#N', 'structural', 'P'], ['c1ccccc1O', 'skeletal', ''], ['ClC(Cl)(Cl)Cl', 'structural', 'P']] as const) {
    const scene = moleculeScene(molecule(s, {hydrogens: extra.includes('H')}), {style, pairs: extra.includes('P'), labels: extra.includes('L'), title: s});
    assert.deepEqual(lw.check(scene), [], s);
  }
});
