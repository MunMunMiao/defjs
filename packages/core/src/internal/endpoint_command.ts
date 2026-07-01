import type { AnyStruct } from '../struct'
import type { EndpointInput } from './endpoint_input'

export type IsEndpointInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<TInput>
    ? true
    : false

export type EndpointCommandBuilder<TInput extends AnyStruct | undefined, TCommand> =
  IsEndpointInputOptional<TInput> extends true ? (input?: EndpointInput<TInput>) => TCommand : (input: EndpointInput<TInput>) => TCommand
