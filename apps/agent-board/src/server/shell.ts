export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function renderArgs(args: string[], prompt: string): string[] {
  return args.map((arg) => arg.replaceAll("{{prompt}}", prompt));
}
