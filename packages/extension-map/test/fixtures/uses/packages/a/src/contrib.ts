import type { Extension } from '@openshift/dynamic-plugin-sdk';
import type { FxA } from './points';

const base: FxA = {
  type: 'fx.a',
  properties: { label: 'one', items: [], component: () => Promise.resolve(() => null) },
};

/** An extension declaration reading another: accesses inside extension literals are no use. */
const extensions: Extension[] = [
  base,
  { type: 'fx.a', properties: { ...base.properties, label: base.properties.label } },
  // The type comes from the spread: still an extension declaration.
  { ...base, properties: { ...base.properties, label: 'three' } },
];

export default extensions;
