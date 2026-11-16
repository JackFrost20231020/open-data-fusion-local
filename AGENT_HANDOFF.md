# 给后续 Agent 的交接说明

本文件描述如何直接 clone 当前发布分支并在本机复现开发。完整源码不等于完整私有案例。

## 直接拉取

仓库：<https://github.com/JackFrost20231020/open-data-fusion-local>

分支：`cursor/publish-odf-snapshot-a2fb`

拉取请求：<https://github.com/JackFrost20231020/open-data-fusion-local/pull/1>

加入本文件之前的提交是 `9edee3f532d5642673d8696219ff83930b1b3781`。请拉取**包含本文件的分支最新提交**，不要停在更早的提交，也不要合并到 `main`。

```bash
git clone --branch cursor/publish-odf-snapshot-a2fb --single-branch https://github.com/JackFrost20231020/open-data-fusion-local.git
cd open-data-fusion-local
```

已有本地仓库时：

```bash
git fetch origin cursor/publish-odf-snapshot-a2fb
git checkout cursor/publish-odf-snapshot-a2fb
git pull --ff-only origin cursor/publish-odf-snapshot-a2fb
```

源码在仓库根目录，没有再套一层 `open-data-fusion/`。不要把改动推送到上游 <https://github.com/HaydernCenterpoint/Open-Data-Fusion>。

许可证是 Apache-2.0，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。更细的本机步骤见 [README.zh-CN.md](README.zh-CN.md)。

## 本机复现

| 工具 | 要求 |
| --- | --- |
| Node.js | `>=24.0.0`（`package.json` 与 lockfile 的 engines） |
| npm | `>=11.0.0` |
| TypeScript | lockfile 锁定 `7.0.2` |
| Python | 解析 `.xlsx` 和跑 `npm test` 需要 3.10+。导入器固定调用 PATH 上的 `python3`，没有 `ODF_PYTHON` |

`package-lock.json` 是 lockfileVersion 3。用 `npm ci`，不要改用没有锁文件的安装。

Web `http://127.0.0.1:5173` 和 API `http://127.0.0.1:4310` 只需要 Node.js。必须用 `npm run dev` 拉起本地服务，不能双击 HTML。`.xlsx` 共管表和 `npm test` 需要 `python3` 能 `import openpyxl`。`npm run typecheck` 与 `npm run build` 不需要 Python。`npm run infra:validate` 只用 Python 标准库。

macOS / Linux：

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -c "import openpyxl; print(openpyxl.__version__)"
npm ci
cp .env.example .env
npm run dev
```

Windows PowerShell。虚拟环境只有 `python.exe`，API 固定调用 `python3`：

```powershell
py -3 -m venv .venv
Copy-Item .\.venv\Scripts\python.exe .\.venv\Scripts\python3.exe
.\.venv\Scripts\Activate.ps1
python3 -m pip install -r requirements.txt
npm ci
Copy-Item .env.example .env
npm run dev
```

`requirements.txt` 钉住 `openpyxl==3.1.5` 和 `et-xmlfile==2.0.0`。不要用 `sudo` 或管理员权限做全局 pip。Debian/Ubuntu 若 `python3 -m venv` 报 `ensurepip is not available`，先安装系统包 `python3-venv`，或对同一个 `python3` 执行 `python3 -m pip install --user -r requirements.txt`。

在已激活该环境的同一终端里启动，API 子进程才会找到这个 `python3`。开发身份是 `ODF_AUTH_MODE=development` 与 `x-odf-user`，不是生产 OIDC。SQLite 默认写到被忽略的 `apps/api/data/`。

检查与测试：

```bash
npm run typecheck
npm test
npm run build
```

前端使用 Vite 8（当前锁定 8.3.8）。npm 可能把它提升到仓库根目录 `node_modules`。不要改用 Vite 7。

## 架构与目录

npm workspaces：`apps/*` 与 `packages/*`。

| 路径 | 作用 |
| --- | --- |
| `apps/web` | React / Vite 前端，画布与浏览器入口，默认端口 5173 |
| `apps/api` | Express API，案例导入、SQLite/PostgreSQL，默认端口 4310 |
| `apps/edge-agent` | 只读采集 |
| `apps/outbox-worker` | PostgreSQL outbox 投递 |
| `apps/pipeline-worker` | 受控流水线 worker |
| `packages/contracts` | 共享契约 |
| `packages/platform-core` | 平台领域逻辑 |
| `packages/postgres-runtime` | PostgreSQL 运行时 |
| `examples/demo-loop` | 合成 DEMO，不是真实工厂案例 |
| `infra/` | PostgreSQL 迁移、Keycloak、MinIO 源码构建、CI 校验 |
| `docs/` | 架构、安全与操作说明 |
| `scripts/dev.mjs` | `npm run dev` 同时启动 API 与 Vite 8 |
| `.env.example` | 可提交的配置样例，不含真实密钥 |

已实现并保留的本地能力包括：工业画布、通用图纸/图谱导入、合成 `examples/demo-loop` 导入、开发态 SQLite、以及上游已有的 Explorer、摄取、协作与 PostgreSQL 配置。打开画布示例：

```text
http://127.0.0.1:5173/?view=canvas&tenant=demo&project=north-plant&user=local-user
```

导入合成示例的命令在 [examples/demo-loop/README.md](examples/demo-loop/README.md) 和 [README.zh-CN.md](README.zh-CN.md)。自有案例只放在本机被忽略的目录（例如 `data/cases/`）后导入，不要提交。

## 不能上传的内容

真实 RCS 案例原文、现场图纸和数据包没有再分发许可，不能放进这个公开仓库。本树也不包含数据库、用户数据、密钥、真实 `.env`、`node_modules`、`dist`、`.venv` 或测试生成的 SQLite。`.env.example` 可以提交。`examples/demo-loop` 是公开合成示例，位号如 `DEMO-PT001`，不是某套真实案例的拷贝或脱敏版。

## 已知限制与剩余阻塞

这些限制留给仓库所有者决定。不要为了让 CI 变绿去改安全策略、关闭检查、合并 `main` 或部署。

- `config/dependency-license-policy.json` 的允许列表没有 `OFL-1.1`。`@fontsource-variable/inter` 与 `@fontsource/noto-sans-sc` 的字体许可证是 SIL OFL 1.1。OFL 允许随软件捆绑，但不能单独售卖字体。把 OFL 加进允许列表属于安全策略变更，当前分支没有改。`supply-chain` 会因此在许可证步骤失败，后面的 `npm audit` 不会执行。
- `npm audit` 在 `9edee3f` 之后的依赖更新上是 0 critical、1 high、18 moderate。唯一 high 是运行时 `zod@3.25.76`。公告范围是 `<4.6.6`，3.x 没有兼容修复；升到 Zod 4 是破坏性升级，没有做。因此 `npm audit --audit-level=high` 仍会失败。
- Dependency graph 未启用。需要在 GitHub 的 Settings → Code security → Dependency graph 打开。不启用时 `dependency-review` 报不支持。workflow 没有删除。
- Code Scanning 已启用，但列出告警的 API 对当时的集成返回 403。分支上做过防御性修改，不能把未复扫的结果说成生产就绪。
- 发布环境没有 Docker，因此没有实际构建 `Dockerfile.web` 和 `infra/minio/Dockerfile.mc`。`minio-bootstrap` 从已签名的上游提交 `7394ce0dd2a80935aded936b09fa12cbb3cb8096` 构建，不再拉取无法匿名获取的 Docker Hub `minio/mc`。

本地 `npm ci` 与 `npm run dev` 可以复现。正式部署仍被上述安全门禁挡住。
