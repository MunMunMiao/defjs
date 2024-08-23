import { type CallExpression, type Expression, type ObjectLiteralExpression, type TypeNode, factory } from 'typescript'

export type CreateFieldCallExpressionOptions = {
  types?: string[]
  required?: boolean
  defaultValue?: string | number | boolean | Array<string | number | boolean>
  // todo
  enum?: string[]
  withJson?: {
    enable: boolean
    alias?: string
  }
  withQuery?: {
    enable: boolean
    alias?: string
  }
  withForm?: {
    enable: boolean
    alias?: string
  }
  withParam?: {
    enable: boolean
    alias?: string
  }
  withHeader?: {
    enable: boolean
    alias?: string
  }
  withUrlForm?: {
    enable: boolean
    alias?: string
  }
  withBody?: {
    enable: boolean
  }
  // withValidators?: {
  //     enable: boolean
  // }
  // withAsyncValidators?: {
  //     enable: boolean
  // }
}

export function createField(options: CreateFieldCallExpressionOptions): CallExpression {
  const { defaultValue, types, withJson, withQuery, withForm, withParam, withHeader, withUrlForm, withBody } = options

  const typeArguments: TypeNode[] = []
  const expression: Expression[] = []

  // typeArguments
  if (Array.isArray(types)) {
    // const keywordTypeNode = types.map(item => factory.createKeywordTypeNode(item))
    // const node = factory.createUnionTypeNode()
    for (const item of types) {
      typeArguments.push(factory.createTypeReferenceNode(factory.createIdentifier(item), undefined))
    }
  }

  // expression
  if (typeof defaultValue !== 'undefined') {
    switch (true) {
      case Array.isArray(defaultValue): {
        expression.push(factory.createArrayLiteralExpression())
        break
      }
      case typeof defaultValue === 'string': {
        expression.push(factory.createStringLiteral(defaultValue))
        break
      }
      case typeof defaultValue === 'number': {
        expression.push(factory.createNumericLiteral(defaultValue))
        break
      }
      case typeof defaultValue === 'boolean': {
        expression.push(defaultValue ? factory.createTrue() : factory.createFalse())
        break
      }
    }
  }

  let fieldCallExpression: CallExpression = factory.createCallExpression(
    // 函数名
    factory.createIdentifier('field'),
    // 函数类型
    typeArguments,
    // [
    //     factory.createUnionTypeNode([
    //         factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
    //         factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword)
    //     ])
    // ],
    // 函数值,
    expression,
  )

  if (withJson?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withJson')),
      undefined,
      withJson.alias ? [factory.createStringLiteral(withJson.alias)] : undefined,
    )
  }

  if (withQuery?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withQuery')),
      undefined,
      withQuery.alias ? [factory.createStringLiteral(withQuery.alias)] : undefined,
    )
  }

  if (withForm?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withForm')),
      undefined,
      withForm.alias ? [factory.createStringLiteral(withForm.alias)] : undefined,
    )
  }

  if (withParam?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withParam')),
      undefined,
      withParam.alias ? [factory.createStringLiteral(withParam.alias)] : undefined,
    )
  }

  if (withHeader?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withHeader')),
      undefined,
      withHeader.alias ? [factory.createStringLiteral(withHeader.alias)] : undefined,
    )
  }

  if (withUrlForm?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withUrlForm')),
      undefined,
      withUrlForm.alias ? [factory.createStringLiteral(withUrlForm.alias)] : undefined,
    )
  }

  if (withBody?.enable) {
    fieldCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(fieldCallExpression, factory.createIdentifier('withBody')),
      undefined,
      undefined,
    )
  }

  return fieldCallExpression
}

export function createFieldGroup(options: Record<string, CreateFieldCallExpressionOptions>): ObjectLiteralExpression {
  return factory.createObjectLiteralExpression(
    Object.entries(options).map(([key, option]) => {
      return factory.createPropertyAssignment(factory.createIdentifier(key), createField(option))
    }),
    true,
  )
}
