import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type ParseNode from '/imports/parser/parseTree/ParseNode';
import type Context from '/imports/parser/types/Context';
import type ResolveLevel from '/imports/parser/types/ResolveLevel';
import type ResolvedResult from '/imports/parser/types/ResolvedResult';

type ResolveOthersFunction = (
  fn: ResolveLevel,
  node: ParseNode,
  scope: Record<string, any>,
  context: Context,
  inputProvider: InputProvider,
) => Promise<ResolvedResult>

export default ResolveOthersFunction;
