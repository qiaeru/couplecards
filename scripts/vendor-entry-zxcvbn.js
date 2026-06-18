// SPDX-License-Identifier: MIT
// esbuild entry that bundles the zxcvbn-ts core together with every supported
// locale's dictionary, then exposes a single `zxcvbn(password, userInputs)`
// function for the browser. Uses namespace imports because @zxcvbn-ts/*
// packages ship ESM with only named exports (no `default`).

import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as commonPackage from '@zxcvbn-ts/language-common';
import * as enPackage from '@zxcvbn-ts/language-en';
import * as frPackage from '@zxcvbn-ts/language-fr';
import * as dePackage from '@zxcvbn-ts/language-de';
import * as itPackage from '@zxcvbn-ts/language-it';
import * as esPackage from '@zxcvbn-ts/language-es-es';

const instance = new ZxcvbnFactory({
  translations: enPackage.translations,
  graphs: commonPackage.adjacencyGraphs,
  dictionary: {
    ...commonPackage.dictionary,
    ...enPackage.dictionary,
    ...frPackage.dictionary,
    ...dePackage.dictionary,
    ...itPackage.dictionary,
    ...esPackage.dictionary,
  },
});

// Keep the v3 call shape `zxcvbn(password, userInputs)` so the browser caller
// in public/js/ui/password-strength.js stays unchanged.
export function zxcvbn(password, userInputs) {
  return instance.check(password, userInputs);
}
