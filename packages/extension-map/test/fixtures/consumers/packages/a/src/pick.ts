import type { Extension } from '@openshift/dynamic-plugin-sdk';
import { isA } from './points';
import type { FxA } from './points';

export const pickA = (list: Extension[]): FxA[] => list.filter(isA);
