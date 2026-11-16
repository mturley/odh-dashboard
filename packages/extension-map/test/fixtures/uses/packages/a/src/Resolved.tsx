import React from 'react';
import type { ResolvedExtension } from '@openshift/dynamic-plugin-sdk';
import type { FxB } from './points';
import { HookNotify } from '../../plugin-core/src/core/helpers/HookNotify';

type Props = { extension: ResolvedExtension<FxB> };

/** Renders a resolved component through a local const. */
export const IconCell = ({ extension }: Props): React.ReactElement => {
  const Icon = extension.properties.icon;
  return <Icon />;
};

/** Renders a resolved component as a member-expression tag. */
export const InlineIcon = ({ extension }: Props): React.ReactElement => (
  <extension.properties.icon />
);

/** Runs a resolved hook through HookNotify. */
export const Notifier = ({ extension }: Props): React.ReactElement => (
  <HookNotify useHook={extension.properties.useValue} />
);

/** Runs a resolved hook by calling it. */
export const useValueOf = ({ extension }: Props): string => extension.properties.useValue();

/** Calls a resolved function. */
export const runIt = ({ extension }: Props): void => extension.properties.run();

/** Destructures the properties it uses. */
export const Destructured = ({ extension }: Props): React.ReactElement => {
  const { icon: Icon, label } = extension.properties;
  return (
    <span>
      {label}
      <Icon />
    </span>
  );
};
