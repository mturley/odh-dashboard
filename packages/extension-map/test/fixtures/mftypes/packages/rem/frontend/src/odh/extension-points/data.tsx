/** Data carried by the `rem.p` point. */
export type RemData = {
  id: string;
};

/** A value of the carried type, exported so code refs can target it. */
export const remData = (id: string): RemData => ({ id });
