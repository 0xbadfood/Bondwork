// RDKit (BSD) in WebAssembly: parsing, canonical SMILES, 2D layout and stereo perception. Loaded once, at import.
import rdkit from '@rdkit/rdkit';
import type {MainModule} from '@rdkit/rdkit';

// the package is CommonJS with ES-module types: Node hands us its factory as the default export
const init = rdkit as unknown as (options?: unknown) => Promise<MainModule>;
export const RD = await init();
