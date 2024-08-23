import { type CallExpression, NodeFlags, SyntaxKind, type TypeNode, factory } from 'typescript'
import { type CreateFieldCallExpressionOptions, createField, createFieldGroup } from './field'

export type CreateDefineRequestOptions = {
  name: string
  method: string
  url: string
  withField?: CreateFieldCallExpressionOptions
  withFieldGroup?: Record<string, CreateFieldCallExpressionOptions>
}

export function createDefineRequest(options: CreateDefineRequestOptions) {
  const { name, method, url, withField, withFieldGroup } = options

  const typeArguments: TypeNode[] = [factory.createKeywordTypeNode(SyntaxKind.NumberKeyword)]

  let defineRequestCallExpression: CallExpression = factory.createCallExpression(factory.createIdentifier('defineRequest'), typeArguments, [
    factory.createStringLiteral(method),
    factory.createStringLiteral(url),
  ])

  if (withField) {
    defineRequestCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(defineRequestCallExpression, factory.createIdentifier('withField')),
      undefined,
      [createField(withField)],
    )
  }

  if (withFieldGroup) {
    defineRequestCallExpression = factory.createCallExpression(
      factory.createPropertyAccessExpression(defineRequestCallExpression, factory.createIdentifier('withField')),
      undefined,
      [createFieldGroup(withFieldGroup)],
    )
  }

  // const jsDocComment = factory.createJSDocComment('这是一个示例函数', [
  //   factory.createJSDocParameterTag(factory.createIdentifier('param'), factory.createIdentifier(''), false),
  // ])

  // factory.createVariableDeclaration(factory.createIdentifier(name), undefined, undefined, defineRequestCallExpression)
  // factory.createVariableDeclarationList([factory.createJSDocComment('dadadsadads')])
  // factory.createJSDocComment('dadadsadads')

  const vs = factory.createVariableStatement(
    [factory.createToken(SyntaxKind.ExportKeyword)],
    factory.createVariableDeclarationList(
      [
        // factory.createJSDocComment('dadadsadads'),
        factory.createVariableDeclaration(factory.createIdentifier(name), undefined, undefined, defineRequestCallExpression),
      ],
      NodeFlags.Const,
    ),
  )

  return factory.createNodeArray([
    factory.createJSDocComment(factory.createNodeArray([factory.createJSDocText('dasdasdsa'), factory.createJSDocText('12312312')], false)),
    vs,
  ])
}
