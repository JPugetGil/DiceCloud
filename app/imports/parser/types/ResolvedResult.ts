import type ParseNode from '/imports/parser/parseTree/ParseNode';
import type Context from './Context';

type ResolvedResult = {
  result: ParseNode;
  context: Context;
};

export default ResolvedResult;
