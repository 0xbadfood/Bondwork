// Drawing: a molecule becomes Linkwork props (lines, polylines, circles, text) in a box on a 1920×1080 stage.
// Props are plain data in Linkwork's scene format, so Linkwork draws, animates and checks them.
import {atomColour, type Colours} from './colours.ts';
import {VALENCE, type Molecule, type Vec} from './molecule.ts';

export type Prop = {id: string; type: string; style?: Record<string, unknown>; [k: string]: unknown};
export type DrawOptions = {
  /** [x, y, w, h] on the stage; the molecule is centred in it. */
  box?: [number, number, number, number];
  /** skeletal: carbons are corners, their hydrogens unwritten; structural: every atom written. */
  style?: 'skeletal' | 'structural';
  /** Lone pairs as pairs of dots (Lewis structures). */
  pairs?: boolean;
  /** R/S at stereo centres and E/Z on double bonds. */
  labels?: boolean;
  /** Atom colours: 'element' (CPK, the default), 'mono', or your own by element. Each bond takes its two atoms'
   * colours half and half. */
  colours?: Colours;
  /** Picks the CPK shades that read on the stage's paper. */
  theme?: 'dark' | 'light';
  /** Atoms picked out in a colour of their own, by index: the atom a step acts on, a stereo centre. */
  highlight?: Record<number, string>;
  /** Longest bond on screen, px. */
  bond?: number;
  id?: string;
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => (n > 1 ? String(n).split('').map(d => SUB[Number(d)]).join('') : '');
const sup = (q: number) => (q ? (Math.abs(q) > 1 ? String(Math.abs(q)) : '') + (q > 0 ? '⁺' : '⁻') : '');
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub2 = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const len = (a: Vec) => Math.hypot(a[0], a[1]);
const unit = (a: Vec): Vec => mul(a, 1 / (len(a) || 1));
const perp = (a: Vec): Vec => [-a[1], a[0]];

/** Half a symbol's width in bold sans: O and C are round and wide, Cl is two letters (0.42 em, 0.5 em). */
const halfWidth = (el: string, size: number) => size * (0.42 + 0.08 * (el.length - 1));

/** Is this atom written as a symbol? Skeletal formulas leave a neutral carbon as a corner when it has a carbon
 * neighbour; one with none is written (H₃C–Br, O=C=O, H₃C–O–CH₃), and so is the middle carbon of C=C=C, which a
 * corner cannot show. */
export function written(m: Molecule, i: number, style: 'skeletal' | 'structural'): boolean {
  const a = m.atoms[i];
  if (style === 'structural' || a.el !== 'C') return true;
  if (a.charge !== 0 || a.radical > 0) return true;
  const mine = m.bonds.filter(b => b.a === i || b.b === i);
  if (!mine.some(b => m.atoms[b.a === i ? b.b : b.a].el === 'C')) return true;
  return mine.filter(b => b.order === 2).length >= 2;
}

/** Where an atom's charge goes: the corner (upper right first) farthest from its bonds and its written hydrogens. */
function chargeDirection(m: Molecule, i: number, at: Vec[]): Vec {
  const taken = m.bonds.filter(b => b.a === i || b.b === i).map(b => unit(sub2(at[b.a === i ? b.b : b.a], at[i])));
  const h = hSide(m, i, at);
  if (h) taken.push(h);
  const corners: Vec[] = [[0.8, -0.6], [-0.8, -0.6], [0.8, 0.6], [-0.8, 0.6]];
  const clearance = (c: Vec) => Math.min(2, ...taken.map(v => 1 - (v[0] * c[0] + v[1] * c[1])));
  return corners.reduce((best, c) => (clearance(c) > clearance(best) + 0.05 ? c : best));
}

/** The symbol sits on the atom, so bonds meet it squarely; its hydrogens go beside it on the side free of bonds (OH on
 * the right of a chain, HO on its left, H₂N below a bond that comes from both sides) and the charge at its upper right. */
function labelProps(m: Molecule, i: number, at: Vec[], size: number, pid: string, fill: string): Prop[] {
  const a = m.atoms[i], [x, y] = at[i], half = halfWidth(a.el, size), base = y;   // Linkwork centres text on its y
  const out: Prop[] = [{id: pid, type: 'text', x, y: base, text: a.el, size, align: 'middle', weight: 600, style: {fill}}];
  const side = hSide(m, i, at), text = 'H' + sub(a.h);
  if (side?.[0] === 1) out.push({id: `${pid}-h`, type: 'text', x: x + half, y: base, text, size, align: 'start', weight: 600, style: {fill}});
  else if (side?.[0] === -1) out.push({id: `${pid}-h`, type: 'text', x: x - half, y: base, text, size, align: 'end', weight: 600, style: {fill}});
  else if (side) out.push({id: `${pid}-h`, type: 'text', x, y: base + side[1] * size * 1.05, text, size, align: 'middle', weight: 600, style: {fill}});
  if (a.charge) {
    // beside the corner of the label that is free: past the hydrogens when they are written on that side
    const c = chargeDirection(m, i, at), past = side && side[0] === Math.sign(c[0]) && side[1] === 0 ? size * 0.62 * text.length : 0;
    out.push({id: `${pid}-q`, type: 'text', x: x + Math.sign(c[0]) * (half + past + size * 0.05), y: y + Math.sign(c[1]) * size * 0.45,
      text: sup(a.charge).replace('⁺', '+').replace('⁻', '−'), size: Math.round(size * 0.7), align: c[0] > 0 ? 'start' : 'end', weight: 700, style: {fill}});
  }
  return out;
}

export function moleculeProps(m: Molecule, options: DrawOptions = {}): Prop[] {
  const style = options.style ?? 'skeletal', id = options.id ?? 'm', [bx, by, bw, bh] = options.box ?? [160, 140, 1000, 800];
  const xs = m.atoms.map(a => a.at[0]), ys = m.atoms.map(a => a.at[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // RDKit lays bonds out one unit long; fit the box with room for labels, never larger than `bond` px a bond
  const k = Math.min(options.bond ?? 130, (bw - 160) / Math.max(x1 - x0, 1e-6), (bh - 160) / Math.max(y1 - y0, 1e-6));
  const at: Vec[] = m.atoms.map(a => [bx + bw / 2 + (a.at[0] - (x0 + x1) / 2) * k, by + bh / 2 - (a.at[1] - (y0 + y1) / 2) * k]);
  const size = Math.round(Math.max(26, Math.min(48, k * 0.42))), width = Math.max(3, k / 22);
  // a written symbol's box (Cl is wider than O): every bond line stops where it leaves it, so lines running side by
  // side (double and triple bonds) and bonds at any angle clear the letters alike
  const pad = size * 0.14, box = (i: number): Vec => [halfWidth(m.atoms[i].el, size) + pad, size * 0.4 + pad];
  const exit = (i: number, start: Vec, dir: Vec): number => {
    const [w, h] = box(i), t: number[] = [];
    if (Math.abs(start[0]) >= w || Math.abs(start[1]) >= h) return 0;
    if (dir[0]) t.push((Math.sign(dir[0]) * w - start[0]) / dir[0]);
    if (dir[1]) t.push((Math.sign(dir[1]) * h - start[1]) / dir[1]);
    return Math.max(0, Math.min(...t));
  };
  const shown = m.atoms.map((_, i) => written(m, i, style));
  const props: Prop[] = [];
  const fill = m.atoms.map((a, i) => options.highlight?.[i] ?? atomColour(a.el, options.colours, options.theme));
  // a bond line in its two atoms' colours, meeting at the bond's middle (one line when they match)
  let ca = 'ink', cb = 'ink';
  const line = (pid: string, a: Vec, b: Vec, extra: Record<string, unknown> = {}) => {
    const piece = (id2: string, u: Vec, v: Vec, stroke: string) =>
      props.push({id: id2, type: 'line', x1: u[0], y1: u[1], x2: v[0], y2: v[1], style: {stroke, width, cap: 'round', ...extra}});
    if (ca === cb) return piece(pid, a, b, ca);
    const mid = mul(add(a, b), 0.5);
    piece(pid, a, mid, ca);
    piece(`${pid}-half`, mid, b, cb);
  };
  for (const [j, b] of m.bonds.entries()) {
    [ca, cb] = [fill[b.a], fill[b.b]];
    const d = unit(sub2(at[b.b], at[b.a]));
    // a line of this bond, `o` off its axis, from where it leaves atom a's symbol to where it meets atom b's
    const ends = (o: Vec): [Vec, Vec] => [
      add(add(at[b.a], o), mul(d, shown[b.a] ? exit(b.a, o, d) : 0)),
      sub2(add(at[b.b], o), mul(d, shown[b.b] ? exit(b.b, o, mul(d, -1)) : 0))];
    const [p, q] = ends([0, 0]);
    const n = perp(d), gap = k * 0.16;
    if (b.stereo === 'wedge') {
      props.push({id: `${id}-b${j}`, type: 'polyline', closed: true,
        points: [p, add(q, mul(n, k * 0.09)), sub2(q, mul(n, k * 0.09))], style: {stroke: ca, fill: ca, width: 1}});
    } else if (b.stereo === 'dash') {
      const steps = 6, [from, to] = [ca, cb];
      for (let s = 1; s <= steps; s++) {
        // each hash is one colour: the near atom's for the first half, the far atom's after
        ca = cb = s <= steps / 2 ? from : to;
        const c = add(p, mul(sub2(q, p), s / steps)), w = k * 0.09 * s / steps;
        line(`${id}-b${j}-${s}`, add(c, mul(n, w)), sub2(c, mul(n, w)), {width: width * 0.8});
      }
    } else if (b.order === 1) {
      line(`${id}-b${j}`, p, q);
    } else if (b.order === 3) {
      line(`${id}-b${j}`, p, q);
      line(`${id}-b${j}-u`, ...ends(mul(n, gap)));
      line(`${id}-b${j}-d`, ...ends(mul(n, -gap)));
    } else {
      const ring = m.rings.find(r => r.includes(b.a) && r.includes(b.b));
      if (ring) {
        // in a ring the second line runs inside, a little shorter
        const centre = mul(ring.reduce((s, i) => add(s, at[i]), [0, 0] as Vec), 1 / ring.length);
        const inward = Math.sign((centre[0] - at[b.a][0]) * n[0] + (centre[1] - at[b.a][1]) * n[1]) || 1;
        const o = mul(n, inward * gap * 1.4), trim = mul(d, k * 0.14);
        line(`${id}-b${j}`, p, q);
        const [p2, q2] = ends(o);
        line(`${id}-b${j}-2`, shown[b.a] ? p2 : add(p2, trim), shown[b.b] ? q2 : sub2(q2, trim));
      } else {
        line(`${id}-b${j}`, ...ends(mul(n, gap / 2)));
        line(`${id}-b${j}-2`, ...ends(mul(n, -gap / 2)));
      }
    }
    if (options.labels && b.cip) {
      const mid = mul(add(at[b.a], at[b.b]), 0.5), side = n[1] < 0 ? n : mul(n, -1);
      props.push({id: `${id}-ez${j}`, type: 'text', x: mid[0] + side[0] * k * 0.45, y: mid[1] + side[1] * k * 0.45,
        text: `(${b.cip})`, size: Math.round(size * 0.7), align: 'middle', style: {fill: 'accent'}});
    }
  }
  for (const [i, a] of m.atoms.entries()) {
    if (shown[i]) props.push(...labelProps(m, i, at, size, `${id}-a${i}`, fill[i]));
    const pairs = options.pairs ? a.pairs : 0;
    // unpaired electrons are drawn on main-group atoms (Cl•, CH3•); a metal ion's d electrons are not dots
    const single = VALENCE[a.el] !== undefined ? a.radical : 0;
    if (pairs || single) props.push(...dots(m, i, at, pairs, single, Math.max(k * 0.36, size * 0.8), k, `${id}-p${i}`, fill[i]));
    if (options.labels && a.cip) {
      const away = freeDirections(m, i, at, 1)[0];
      props.push({id: `${id}-cip${i}`, type: 'text', x: at[i][0] + away[0] * k * 0.5, y: at[i][1] + away[1] * k * 0.5,
        text: a.cip, size: Math.round(size * 0.75), align: 'middle', weight: 700, style: {fill: 'accent'}});
    }
  }
  return props;
}

/** Which side of a written atom its hydrogens go: right unless a bond goes right, then left, then below or above. */
function hSide(m: Molecule, i: number, at: Vec[]): Vec | null {
  if (!m.atoms[i].h) return null;
  const nb = m.bonds.filter(b => b.a === i || b.b === i).map(b => sub2(at[b.a === i ? b.b : b.a], at[i]));
  const sides: Vec[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const free = (v: Vec) => !nb.some(u => (u[0] * v[0] + u[1] * v[1]) > 0.3 * len(u));
  // no side quite free (CHCl3): the side whose nearest bond is farthest away
  const room = (v: Vec) => Math.min(...nb.map(u => 1 - (u[0] * v[0] + u[1] * v[1]) / len(u)));
  return sides.find(free) ?? sides.reduce((best, v) => (room(v) > room(best) + 1e-6 ? v : best));
}

/** Directions (screen, unit) into the widest gaps between an atom's bonds, `n` of them. */
function freeDirections(m: Molecule, i: number, at: Vec[], n: number): Vec[] {
  // the bonds, and the written hydrogens, take their directions; lone pairs go into what is left
  const taken = m.bonds.filter(b => b.a === i || b.b === i).map(b => sub2(at[b.a === i ? b.b : b.a], at[i]));
  const h = written(m, i, 'structural') ? hSide(m, i, at) : null;
  if (h) taken.push(h);
  if (m.atoms[i].charge) taken.push(chargeDirection(m, i, at));
  const angles = taken.map(v => Math.atan2(v[1], v[0])).sort((x, y) => x - y);
  if (!angles.length) return Array.from({length: n}, (_, j) => [Math.cos(-Math.PI / 2 + (2 * Math.PI * j) / n), Math.sin(-Math.PI / 2 + (2 * Math.PI * j) / n)] as Vec);
  // split each gap between neighbouring bonds by how many items it takes, the widest gaps first
  const gaps = angles.map((a, j) => ({from: a, size: (j + 1 < angles.length ? angles[j + 1] : angles[0] + 2 * Math.PI) - a, take: 0}));
  for (let j = 0; j < n; j++) gaps.reduce((w, g) => (g.size / (g.take + 1) > w.size / (w.take + 1) ? g : w)).take++;
  return gaps.flatMap(g => Array.from({length: g.take}, (_, j) => {
    const t = g.from + (g.size * (j + 1)) / (g.take + 1);
    return [Math.cos(t), Math.sin(t)] as Vec;
  }));
}

/** Lone pairs as pairs of dots and unpaired electrons as single dots (always drawn: Cl• is not Cl), in the free gaps. */
function dots(m: Molecule, i: number, at: Vec[], pairs: number, single: number, reach: number, k: number, pid: string, fill: string): Prop[] {
  const r = Math.max(3, k * 0.035);
  return freeDirections(m, i, at, pairs + single).flatMap((d, j) => {
    const c = add(at[i], mul(d, reach)), side = mul(perp(d), k * 0.07);
    const at2 = j < pairs ? [add(c, side), sub2(c, side)] : [c];
    return at2.map((p, s) => ({id: `${pid}-${j}-${s}`, type: 'circle', x: p[0], y: p[1], r, style: {fill}}));
  });
}

/** A still Linkwork scene of one molecule (1920×1080), for previews and tests. */
export function moleculeScene(m: Molecule, options: DrawOptions & {title?: string; duration?: number} = {}) {
  const props = moleculeProps(m, options);
  if (options.title) props.push({id: 'title', type: 'text', x: 1260, y: 160, text: options.title, size: 44, weight: 700, width: 560});
  return {linkwork: 1 as const, width: 1920, height: 1080, fps: 30, duration: options.duration ?? 3, theme: options.theme ?? 'dark', props, actors: []};
}
