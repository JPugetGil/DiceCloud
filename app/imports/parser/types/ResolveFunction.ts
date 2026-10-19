import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type ParseNode from '/imports/parser/parseTree/ParseNode';
import type Context from './Context';
import type ResolvedResult from './ResolvedResult';
import type ResolveLevel from './ResolveLevel';
import type ResolveOthersFunction from './ResolveOthersFunction';

type ResolveFunction<T extends ParseNode> = (
  fn: ResolveLevel,
  node: T,
  scope: Record<string, any>,
  context: Context,
  input: InputProvider,
  resolveOthers: ResolveOthersFunction,
) => Promise<ResolvedResult>;

export default ResolveFunction;

