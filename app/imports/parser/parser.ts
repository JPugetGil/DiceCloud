import grammar from '/imports/parser/grammar';
import { Parser, Grammar } from 'nearley';
import type ParseNode from '/imports/parser/parseTree/ParseNode';
import { setCalculationParser } from '/imports/api/creature/creatures/scopeVariables';

const nearleyGrammar = Grammar.fromCompiled(grammar);

export function parse(string: string): ParseNode {
  const parser = new Parser(nearleyGrammar);
  parser.feed(string);
  const results = parser.results;
  if (results.length === 1) {
    return results[0];
  } else if (results.length === 0) {
    // Valid parsing up until now, but need more
    throw new EndOfInputError('Unexpected end of input');
  } else {
    console.warn('Grammar is ambiguous!', { string, results });
    return results[0];
  }
}

export function prettifyParseError(e: unknown): string {
  // The first sentence of a parse error; whatever was thrown, as text
  return String((e as { message?: unknown } | undefined)?.message ?? e).split('.')[0];
}

class EndOfInputError extends Error {
  constructor(message = '') {
    super(message);
  }
}

// The scopes' linked constants are parsed here (scopeVariables.ts does not
// import the parser, which reaches it again through the accessors)
setCalculationParser(parse);
