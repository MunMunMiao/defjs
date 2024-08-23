import { writeFileSync } from 'node:fs'
import { NewLineKind, NodeFlags, SyntaxKind, createPrinter, factory } from 'typescript'

// 创建函数的参数 a 和 b
const paramA = factory.createParameterDeclaration(
  undefined, // 修饰符（例如 public, private, protected）
  undefined, // 装饰器
  factory.createIdentifier('a'), // 参数名
  undefined, // 问号（可选参数）
  factory.createKeywordTypeNode(SyntaxKind.NumberKeyword), // 参数类型
  undefined, // 默认值
)

const paramB = factory.createParameterDeclaration(
  undefined,
  undefined,
  factory.createIdentifier('b'),
  undefined,
  factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
  undefined,
)

// 创建函数体，返回 a + b
const functionBody = factory.createBlock(
  [
    factory.createReturnStatement(
      factory.createBinaryExpression(factory.createIdentifier('a'), SyntaxKind.PlusToken, factory.createIdentifier('b')),
    ),
  ],
  true,
)

// 创建函数声明
const functionDeclaration = factory.createFunctionDeclaration(
  [factory.createModifier(SyntaxKind.ExportKeyword)], // 修饰符，export
  undefined, // 星号（生成器函数）
  factory.createIdentifier('add'), // 函数名
  undefined, // 类型参数
  [paramA, paramB], // 参数列表
  factory.createKeywordTypeNode(SyntaxKind.NumberKeyword), // 返回类型
  functionBody, // 函数体
)

// 创建源文件
const sourceFile = factory.createSourceFile(
  [functionDeclaration], // 包含的节点，比如函数声明
  factory.createToken(SyntaxKind.EndOfFileToken), // 文件结束符
  NodeFlags.None, // 节点标志
)

// 设置打印选项
const printer = createPrinter({
  newLine: NewLineKind.LineFeed,
})

// 将 AST 打印为 TypeScript 代码
const result = printer.printFile(sourceFile)

// 将生成的代码写入 add.ts 文件
writeFileSync('add.ts', result)

console.log('add.ts 文件已生成')
