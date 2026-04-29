export interface ToolErrorResult {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
}

export const toolErrorResult = (_err: unknown): ToolErrorResult => {
  throw new Error('toolErrorResult: not implemented');
};
