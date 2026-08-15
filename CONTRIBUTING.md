# 贡献指南 / Contributing

感谢你考虑为 **dsh-quick-refresh** 做贡献！🎉

## 开发环境

- Node.js ≥ 20（推荐 22 LTS / 24）
- pnpm ≥ 10
- DeepSeek Harness (DSH) `>= 0.1.0-rc.6`

```sh
pnpm install
```

仓库内目前没有构建脚本，源码即产物。`lib/index.js` 与 `lib/client.js` 通过 `tsdown`（在 dsh 运行时里）实时打包；本仓库只放源码与 `cordis.patch.yml`。

## 提 PR 流程

1. Fork 本仓库
2. 新建分支：`git checkout -b feat/your-change`
3. 提交修改：`git commit -m "feat: 描述你的改动"`
4. 推送到你的 fork：`git push origin feat/your-change`
5. 在 GitHub 上开 Pull Request，描述：
   - 解决的问题 / 新增的能力
   - 截图或日志（如果涉及 UI）
   - 是否影响现有功能（disable / enable、刷新按钮位置等）

## 报告 Bug

请用 GitHub Issues，并尽量提供：

- DSH 版本、`dSH web` 启动日志（关注 `[dsh-quick-refresh]` 行）
- 复现步骤
- 期望结果 vs 实际结果
- 截图（如涉及 UI）

## 代码风格

- ESM only（`"type": "module"`）
- 2 空格缩进
- 客户端代码挂在 `window.__ModuleLoader__.load({ id, factory })` 下，参考 `lib/client.js`
- host 端导出 `name / inject / apply`，参考 `lib/index.js`
- 不要在插件里引入会污染全局的副作用

## 发布

维护者（@konwait12）会：

1. 在 `CHANGELOG.md` 写新条目
2. `npm version patch|minor|major`
3. `npm publish --access public`
4. `git push --follow-tags`

感谢贡献！