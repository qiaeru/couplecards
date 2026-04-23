// SPDX-License-Identifier: MIT
// esbuild entry that re-exports JSZip for the browser. Only loaded by the
// admin panel when the Import a backup dialog needs to unzip a deck.

import JSZip from 'jszip';

export default JSZip;
