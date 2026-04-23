// SPDX-License-Identifier: MIT
// esbuild entry that bundles the zxcvbn-ts core together with the English and
// French dictionaries, then exposes a single `zxcvbn(password, userInputs)`
// function for the browser. Uses namespace imports because @zxcvbn-ts/*
// packages ship ESM with only named exports (no `default`).

import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as commonPackage from '@zxcvbn-ts/language-common';
import * as enPackage from '@zxcvbn-ts/language-en';
import * as frPackage from '@zxcvbn-ts/language-fr';

zxcvbnOptions.setOptions({
  translations: enPackage.translations,
  graphs: commonPackage.adjacencyGraphs,
  dictionary: {
    ...commonPackage.dictionary,
    ...enPackage.dictionary,
    ...frPackage.dictionary,
  },
});

export { zxcvbn, zxcvbnOptions };
