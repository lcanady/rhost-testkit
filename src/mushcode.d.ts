declare module '@ursamu/mushcode' {
  export function parse(text: string, opts?: Record<string, unknown>): unknown;
  export function print(ast: unknown, opts?: { mode?: string }): string;
}
