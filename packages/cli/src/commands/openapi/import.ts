import { type ImportDeclaration, factory } from 'typescript'

export type CreateImportOptions = {
  moduleName: string
  imports: { name: string; isTypeOnly: boolean }[]
}

export function createImport(options: CreateImportOptions): ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports(
        options.imports.map(item => factory.createImportSpecifier(item.isTypeOnly, undefined, factory.createIdentifier(item.name))),
      ),
    ),
    factory.createStringLiteral(options.moduleName),
  )
}
