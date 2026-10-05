import grammar from '/imports/parser/grammar';
import { Parser, Grammar } from 'nearley';
import ParseNode from '/imports/parser/parseTree/ParseNode';
import { Meteor } from 'meteor/meteor';

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

export function prettifyParseError(e: Meteor.Error | Error): string {
  return e.message.split('.')[0];
}

class EndOfInputError extends Error {
  constructor(message = '') {
    super(message);
  }
}
