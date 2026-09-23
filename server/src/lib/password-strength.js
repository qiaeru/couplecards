// SPDX-License-Identifier: MIT
// zxcvbn-ts scoring with the common + EN/FR/DE/IT/ES dictionaries, run as a
// one-shot worker thread by validatePassword(). The dictionaries weigh ~130 MB
// once loaded; a worker hands that memory back to the OS when it exits, where
// loading them in the main thread kept it for the process lifetime.

import { parentPort, workerData } from 'node:worker_threads';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import * as zxcvbnFrPackage from '@zxcvbn-ts/language-fr';
import * as zxcvbnDePackage from '@zxcvbn-ts/language-de';
import * as zxcvbnItPackage from '@zxcvbn-ts/language-it';
import * as zxcvbnEsPackage from '@zxcvbn-ts/language-es-es';

const zxcvbn = new ZxcvbnFactory({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFrPackage.dictionary,
    ...zxcvbnDePackage.dictionary,
    ...zxcvbnItPackage.dictionary,
    ...zxcvbnEsPackage.dictionary,
  },
});

const { score, feedback } = zxcvbn.check(workerData.password, workerData.userInputs);
parentPort.postMessage({ score, feedback });
