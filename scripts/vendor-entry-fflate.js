// SPDX-License-Identifier: MIT
// esbuild entry that re-exports the fflate primitives we need in the browser.
// Only loaded by the admin panel when the Import a backup dialog needs to
// unzip a deck.

export { unzipSync, strFromU8 } from 'fflate';
