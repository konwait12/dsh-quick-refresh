# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

- 暂无

## [0.1.0] - 2026-08-15

### Added

- 新增 DSH Web 插件 `dsh-quick-refresh`
- 在会话页右上角 “session log（轨迹）” 标签左侧插入 `⟳` 刷新按钮（克隆标签外观，按字符宽度紧凑显示）
- 点击刷新按钮后：
  - 重新读取 `profiles/web/cordis.patch.yml`
  - 把 `disabled: true/false` 变更应用到当前运行中的 Loader（免重启）
  - 尽量热挂载新增的简单插件
  - 自动刷新页面生效
- 保留设置页入口：**设置 → 插件 → 刷新**
- 提供 `/api/dsh-quick-refresh` host API（refresh / status）
- MIT License 开源

[0.1.0]: https://github.com/konwait12/dsh-quick-refresh/releases/tag/v0.1.0
