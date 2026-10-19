# YiLin

译林语言学习应用，使用 React、TypeScript 和 Vite，支持阅读、查词、写作训练、词卡复习与 AI 角色对话。

## 本地运行

需要 Node.js 24。安装依赖后启动：

```powershell
npm.cmd install
npm.cmd install --prefix tools/web2apk-builder
npm.cmd run dev:online
```

访问 `http://127.0.0.1:5173`。此命令同时启动网页和本地账号服务，不需要线上服务器。
在“我的 → 账号与同步”注册登录，可用两个浏览器窗口或独立浏览器配置测试跨设备同步。

仅启动网页可使用 `npm.cmd run dev`；打包与开发者管理使用 `npm.cmd run admin:dev`。

## 介绍网站与本地文案管理

介绍网站源码位于 `website/`，使用独立的静态构建。

公开网站：[https://yvanlouise.github.io/YiLin/](https://yvanlouise.github.io/YiLin/)。推送网站更新到 `main` 后，GitHub Actions 自动部署 GitHub Pages，并保留原有软件更新清单地址。

双击 `website/start-admin.cmd`，或运行：

```powershell
cd website
npm.cmd run admin
```

访问 `http://127.0.0.1:5194`，可分区编辑网站文案、版本和下载链接，修改软件及网站 README，并预览保存后的网页。点击“一键更新仓库”会在独立发布目录中提交网站、Pages 部署流程和选中的 README，推送到 `YvanLouise/YiLin` 的 `main` 分支，随后自动部署公开站。主项目其他未提交改动不参与提交。

详细运行、登录与备份说明见 [网站管理说明](website/README.md)。

## 验证

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run account:test
npm.cmd run account:ui-test
npm.cmd run reliability:ui-test
npm.cmd run motion:ui-test
npm.cmd run onboarding:ui-test
npm.cmd run reading:layout-test
npm.cmd run overlay:ui-test
npm.cmd run build
npm.cmd run production:ui-test
npm.cmd run admin:build
```

`lint` 检查 React Hooks 调用与依赖。`test` 自动发现 `tests/*.test.mjs`，包含数据库失败后的恢复、阅读数据未就绪时的词卡保护、AI 流式请求竞态和大批量同步回归。`reliability:ui-test` 使用本地模拟 SSE 与真实 IndexedDB，验证停止后保留部分回答，以及删除、清空后迟到回复不会恢复记录；截图默认写入系统临时目录。浏览器回归需要本机安装 Chrome。

`production:ui-test` 在构建后运行，检查生产包首屏资源、阅读与学习等页面的按需加载、AI 抽屉和静态资源响应；截图保存到系统临时目录。

GitHub Actions 在 Node.js 24 的 Windows 和 Linux 环境执行依赖安装、Hooks 检查、全部单元测试、应用构建和打包管理工具构建。依赖版本由两份 `package-lock.json` 固定，CI 使用 `npm ci`。

账号与同步的实现、数据范围及后续部署说明见 [ONLINE_ACCOUNTS.md](docs/ONLINE_ACCOUNTS.md)。
Android 打包说明见 [打包工具](tools/web2apk-builder/README.md)，公开配置管理见 [DEVELOPER_ADMIN.md](DEVELOPER_ADMIN.md)。
Android 外部悬浮词典的授权、使用、独立测试 APK 和真机验收说明见 [EXTERNAL_DICTIONARY.md](docs/EXTERNAL_DICTIONARY.md)。

界面动效遵循系统“减少动态效果”，也可在“我的 → 界面动效”关闭。动效时长与样式集中在 `src/styles/motion.css`，页面切换使用可取消的动画，弹窗保留退出过渡和焦点恢复。`motion:ui-test` 在独立浏览器上下文中检查桌面、手机、快速切换、弹窗定位与关闭动效，不访问外部服务。

首次启动教程包含阅读、点词、词卡、理解与写作、场景对话、可选 AI 配置和账号同步。可选学习起点、按章节跳转、刷新后继续，以及在“我的”中重看或续看。教程演示只保存教程进度，不修改真实学习记录，也不调用 AI。已跳过旧教程的用户不会被强制重新引导。

文章导入会沿完整句子整理长段落，谨慎合并复制文本中的断行，并保留明确的段落边界和 Markdown 结构。阅读页支持更短的视觉段落、清晰的标题层次、阅读时长提示与收起的操作说明；旧文章的笔记、书签、译文和句子编号保持兼容。`reading:layout-test` 使用独立 Vite 与 Chrome 上下文，验证手机、桌面、深色模式、日文、普通导入、缓存译文、查词入口和阅读进度恢复，截图默认保存到系统临时目录。

页面、AI 客户端和工具面板按需加载，功能样式随对应模块加载。阅读滚动复用段落位置缓存，在布局变化时重新测量；长文章回归同时检查滚动过程中的测量次数。Android Java 源码模板集中在 `tools/web2apk-builder/templates`，模板生成与打包服务分别维护。
