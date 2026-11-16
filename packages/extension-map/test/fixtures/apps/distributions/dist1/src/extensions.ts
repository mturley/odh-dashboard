import type { Extension } from '@openshift/dynamic-plugin-sdk';

const extensions: Extension[] = [
  { type: 'app.suppress', properties: { targetType: 'fx.item', targetId: 'a-one' } },
  {
    type: 'app.patch',
    properties: { targetType: 'app.navigation/href', targetId: 'a-two', patch: { group: 'g' } },
  },
];

export default extensions;
