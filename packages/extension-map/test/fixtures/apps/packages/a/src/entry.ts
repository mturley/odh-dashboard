import type { Extension } from '@openshift/dynamic-plugin-sdk';

const extensions: Extension[] = [
  { type: 'fx.item', properties: { id: 'a-one' } },
  { type: 'app.navigation/href', properties: { id: 'a-two' } },
];

export default extensions;
