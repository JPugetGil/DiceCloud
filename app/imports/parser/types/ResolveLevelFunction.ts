import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type ParseNode from '/imports/parser/parseTree/ParseNode';
import type Context from './Context';
import type ResolvedResult from './ResolvedResult';
import type ResolveOthersFunction from './ResolveOthersFunction';

type ResolveLevelFunction<T extends ParseNode> = (
  node: T,
  scope: Record<string, any>,
  context: Context,
  input: InputProvider,
  resolveOthers: ResolveOthersFunction,
) => Promise<ResolvedResult>;

export default ResolveLevelFunction;
