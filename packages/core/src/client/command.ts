export interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

export type Command = BaseCommand<string>
