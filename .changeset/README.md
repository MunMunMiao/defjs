# Changesets

每次提交会影响发布的代码变更时，请运行：

```bash
pnpm run changeset
```

按提示选择受影响的包、填写变更说明、选择 bump 类型（patch / minor / major）。

生成的 `.changeset/*.md` 文件请随 PR 一起提交。合并后，changesets bot 会自动创建 Version Packages PR。
