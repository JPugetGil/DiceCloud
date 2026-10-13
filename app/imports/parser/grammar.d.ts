// What grammar.js exports: nearley's compiled grammar. grammar.js itself is
// generated from grammar.ne (see readme.md), so the type check skips it
// (tsconfig.json) and reads this file instead
declare const grammar: {
  Lexer: unknown,
  ParserRules: { name: string, symbols: unknown[], postprocess?: (data: any[]) => unknown }[],
  ParserStart: string,
};
export default grammar;
