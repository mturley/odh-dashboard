// A function that shares the runtime's name but is not it: its calls load nothing.
const loadRemote = (name: string): Promise<string> => Promise.resolve(name);

export const load = (): Promise<string> => loadRemote('rem/extensions');
