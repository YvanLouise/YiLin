# 译林介绍网站

独立的中文产品介绍网站，沿用译林的 YL 标识，以阅读、查词、记忆和表达组织内容。页面使用原生 HTML、CSS 和 JavaScript，不依赖应用本体或在线 AI 服务。

公开网站：[https://yvanlouise.github.io/YiLin/](https://yvanlouise.github.io/YiLin/)。

## GitHub Pages 部署

仓库使用 `.github/workflows/website-pages.yml` 从 `main` 分支自动构建和部署，产物只包含静态网站以及原 `docs/` 的公开资源。软件已有的 `/YiLin/app-update.json` 地址继续可用。也可在 GitHub Actions 中手动运行 `Deploy YiLin website`。

本地运行 `npm.cmd run build:pages` 可生成同样的产物，输出为 `.local/pages/`。GitHub Pages 只托管这些静态文件；文案管理服务仍在本机运行。

## 运行

需要 Node.js 24，无需安装依赖。在本目录执行：

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run dev
```

访问 `http://127.0.0.1:5193`。修改源文件后重新构建并刷新页面。

## 本地管理页

双击 `start-admin.cmd`，或在本目录运行 `npm.cmd run admin`，访问 `http://127.0.0.1:5194`。服务只监听本机，无需安装额外依赖。

重复双击会直接打开同一项目已运行的管理页，保留原有会话和正在进行的更新任务。如果端口被其他程序或另一份项目占用，会显示明确提示；可在 PowerShell 中指定其他端口后启动：

```powershell
$env:ADMIN_PORT = '5195'
npm.cmd run admin
```

此时访问 `http://127.0.0.1:5195`。

- 网站文案：分区编辑全部静态文字、演示提示、词义和页面信息，支持搜索与桌面 / 手机预览。
- README 文档：分别编辑软件根目录与网站目录的 README，右侧预览 Markdown；不执行文档中的 HTML。
- 版本与链接：集中维护 Android 版本、安装包地址与项目链接。
- 保存修改：写入本地源文件并重新构建网站，保存前在 `.local/backups/` 保留旧文件。检测到外部修改时拒绝覆盖。
- 一键更新仓库：保存、构建，在 `.local/publish/` 新建独立发布目录，提交 `website/`、指定的 Pages 部署流程和可选的软件 `README.md`，推送到 `YvanLouise/YiLin` 的 `main` 分支。随后 GitHub Actions 自动部署公开站。主项目现有索引与其他未提交文件不参与提交。

推送复用本机 Git 凭据。如果未登录，可执行 `gh auth login --hostname github.com --git-protocol https` 与 `gh auth setup-git`。管理页不接收或保存访问令牌。连接或认证失败时保留修改与本地提交，可在页面重试；远端有新提交时需先刷新仓库状态并核对。

`.local/` 中的备份、发布目录和最近 30 次结果不会上传。管理员服务与 README 文件也不会被打进公开网站的 `dist/`。公开站的更新结果可在管理页“查看网站部署”进入 GitHub Actions 确认。

验证管理页与发布隔离逻辑：`npm.cmd test`。测试使用独立临时文件和本地裸 Git 仓库，不访问真实 GitHub 仓库。

## 文件

- `src/index.html`：完整页面结构、SEO 信息及可访问的交互控件。
- `src/styles.css`：蓝白视觉、字体、响应式布局及减少动效偏好。
- `src/main.js`：点词查义、生词本演示、词卡翻面、写作示例、场景对话、移动导航。
- `data/release.json`：Android 版本、安装包地址、GitHub 和网站地址；发布新版时统一更新这里。
- `data/content.json`：带分区和标签的可编辑文案，是网站文字的唯一数据源。
- `data/repository.json`：本地管理页的 GitHub 仓库、分支与网站目录配置。
- `admin/`：本地文案、README 与仓库更新界面；`scripts/admin-server.mjs` 提供本机 API。
- `public/assets/`：原有品牌标识、自托管字体及其许可证、生成的森林背景和分享封面。
- `design/`：四个主要区域的视觉设计稿。
- `dist/`：构建后可直接托管的静态网站。
- `.openai/hosting.json`：Sites 项目标识与静态产物目录。

## 设计系统

背景使用纯白 `#ffffff`，主色使用钴蓝 `#2463eb`，正文使用深蓝 `#11233e`，学习演示区域使用浅蓝 `#eef4ff`。中文使用本地提供的 Noto Sans SC 子集字体，英文阅读内容使用 Georgia。主内容最大宽度为 1424px。

页面依次为首屏、阅读体验、记忆与表达、常见问题与下载。保留开阔排版、单一产品窗口、细分隔线和简洁按钮。手机上调整为单列，导航折叠，释义面板跟随文章展示；所有控件支持键盘操作，并遵循系统减少动效设置。

首屏标题、导航、按钮与视觉稿一致。产品窗口中的英文使用软件已有文章内容；页面只保留一套全局导航。写作与对话明确标为本地示例，实际 AI 功能和数据同步条件在常见问题中说明。

网页生词本仅用于当前页面的交互体验，不读取、修改或同步软件的学习记录。下载链接和项目地址来自现有发布清单。
