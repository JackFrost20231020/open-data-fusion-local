# Open Data Fusion — 本地运行说明

本目录是可在你自己电脑上运行的 **Open Data Fusion** 源码（前端 + API），不是一份打开就能看的静态 HTML。  
它基于上游开源项目 [HaydernCenterpoint/Open-Data-Fusion](https://github.com/HaydernCenterpoint/Open-Data-Fusion)（Apache-2.0），并包含本地工业画布、图纸选择和通用案例导入等改动。

**本发行包不含任何私有工厂案例、现场图纸、密钥或数据库。** 不要把未授权的案例资料提交或推送到公开仓库。若你持有自己的案例包，只应放在本机目录中导入。

更完整的英文产品说明见 [README.md](README.md)。许可证见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

---

## 需要准备什么

| 环境 | 版本 | 用途 |
| --- | ---: | --- |
| Node.js | **24 或更高** | API、前端、测试、构建 |
| npm | **11 或更高** | 安装工作区依赖 |
| Python 3 | **3.10 或更高**（本仓库在 3.12.3 上核对过） | 解析 `.xlsx` 共管表，以及跑包含该解析的单元测试。启动 Web/API 本身不需要 |
| poppler（`pdftotext`） | 可选 | 解析案例包中的 PDF |
| LibreOffice（`soffice`） | 可选 | 解析案例包中的 `.doc` / `.docx` |
| Docker Compose | 可选 | PostgreSQL / Redis 等生产向配置，本地试用不必安装 |

查看版本：

```bash
node -v    # 例如 v24.22.1
npm -v     # 例如 11.21.1
```

Windows 请从 [nodejs.org](https://nodejs.org/) 安装官方 LTS/Current 中满足上述要求的版本，并在 **PowerShell** 或 **Windows Terminal** 中操作。macOS 可用官方安装包或 `brew install node@24`。

根 `package.json` 与 `package-lock.json` 的 `engines` 是 Node.js `>=24.0.0`、npm `>=11.0.0`。锁文件是 lockfileVersion 3，锁定的 TypeScript 是 **7.0.2**。`apps/api` 只声明了 Node.js `>=24.0.0`。这些是下限，不是“任意当前版本都能过类型检查”的承诺。

### Python：哪些步骤需要，哪些不需要

案例导入里的 `.xlsx` 共管表由 API 子进程执行 PATH 上的 **`python3`** 完成（`python3 -c` 再 `import openpyxl`）。代码没有 `ODF_PYTHON` 或其他解释器配置项；启动 API 的那个环境里必须能直接运行 `python3`，并且这个解释器已经装好下面的依赖。

| 动作 | 是否需要 Python / openpyxl |
| --- | --- |
| `npm ci`、`npm run dev`、打开 `http://127.0.0.1:5173` 和 `http://127.0.0.1:4310` | 不需要。只需要 Node.js 24+ 与 npm 11+ |
| 导入只有图谱 / 点表的案例，或只浏览画布 | 不需要 |
| 解析 `shared-pipe.xlsx`（包括合成示例 `examples/demo-loop` 里的共管表） | 需要 `python3` 和 `requirements.txt` 里的 openpyxl |
| `npm test` | 需要。`apps/api` 的案例导入测试会断言 xlsx 被解析；未安装时这两个测试失败，其余测试仍可运行 |
| `npm run typecheck`、`npm run build` | 不需要 Python |
| `npm run infra:validate` | 需要 PATH 上的 `python` / `python3`，只用标准库，不需要 openpyxl |
| PDF（`pdftotext`）、Word（`soffice`） | 与 Python 无关，仍是可选外部程序 |

不要用 `sudo` 或管理员权限做全局 `pip install`。依赖版本钉在仓库根目录的 `requirements.txt`（`openpyxl==3.1.5`，以及它需要的 `et-xmlfile==2.0.0`）。

macOS / Linux（在仓库根目录，虚拟环境里的 `python3` 会排到 PATH 前面，API 子进程才能用到它）：

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -c "import openpyxl; print(openpyxl.__version__)"
```

Debian/Ubuntu 上若 `python3 -m venv` 报 `ensurepip is not available`，先用系统包安装 `python3-venv`（例如 `python3.12-venv`），再重建 `.venv`。这是系统包，不是 `sudo pip`。也可以不建虚拟环境，直接对 PATH 上的同一个 `python3` 做用户级安装：`python3 -m pip install --user -r requirements.txt`。

Windows PowerShell。Windows 虚拟环境只有 `python.exe`，而 API 固定调用 `python3`，所以激活前先复制出一个同目录的 `python3.exe`：

```powershell
py -3 -m venv .venv
Copy-Item .\.venv\Scripts\python.exe .\.venv\Scripts\python3.exe
.\.venv\Scripts\Activate.ps1
python3 -m pip install -r requirements.txt
python3 -c "import openpyxl; print(openpyxl.__version__)"
```

若系统里已经有 `python3` 且你不使用虚拟环境，可以用用户级安装（仍然不要提权）：

```powershell
python3 -m pip install --user -r requirements.txt
```

macOS 上若系统 Python 拒绝安装（externally managed），使用上面的 `.venv`，不要改用 `sudo pip`。装完后，在**同一个已经激活虚拟环境的终端**里执行 `npm ci` 和 `npm run dev`。

---

## 快速开始（推荐）

### 1. 取得源码并安装依赖

从本 Git 仓库克隆时，源码就在仓库根目录。在根目录执行 `npm ci` 和 `npm run dev`，不要再进入 `open-data-fusion/` 子目录。**不要**把上游 `HaydernCenterpoint/Open-Data-Fusion` 当作本改动版的发布地址来推送。

```bash
# macOS / Linux（在仓库根目录）
git clone <你的仓库地址>
cd <仓库目录>
npm ci
```

```powershell
# Windows PowerShell（在仓库根目录）
git clone <你的仓库地址>
cd <仓库目录>
npm ci
```

若你拿到的仍是带一层目录的 zip 压缩包，解压后进入那个目录再执行 `npm ci`。本仓库的 Git 树没有这一层。

`npm ci` 需要仓库中的 `package-lock.json`，安装结果与锁文件一致。若 `npm ci` 不可用，可改用 `npm install`。

### 2. 创建本地配置

```bash
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

在 `.env` 中至少设置（不要把填好密钥的 `.env` 再发到网上）：

```text
ODF_AUTH_MODE=development
ODF_DEV_USER=local-user
ODF_DATA_PERSISTENCE=sqlite
ODF_SEED=true
ODF_API_HOST=127.0.0.1
PORT=4310
```

说明：

- `ODF_SEED=true` 只会在**空的** SQLite 库里写入非敏感的演示资产（如北厂 / 泵 P-101），便于先打开界面。它**不会**导入任何私有案例。
- 数据默认写到 `apps/api/data/open-data-fusion.db`（该目录已被 git 忽略）。换一台电脑或删除该文件即相当于空白环境。
- 开发模式可用 `?user=` / `x-odf-user` 声明本地用户；这**不是**生产环境的身份认证。面向互联网部署前必须改用 OIDC 等正式模式。

### 3. 一条命令同时启动 API 和前端

在仓库根目录执行：

```bash
npm run dev
```

等价于：

```bash
# macOS / Linux
./scripts/dev.sh
```

```powershell
# Windows PowerShell
.\scripts\dev.ps1
```

启动脚本会：

- 检查 Node.js 是否 ≥ 24
- **使用 Vite 8**。npm 可能把它提升到仓库根目录 `node_modules`，这没问题；不要改用 Vite 7
- 同时拉起 API 与前端，Ctrl+C 会一起停掉

启动成功后：

| 服务 | 默认地址 |
| --- | --- |
| 前端 | http://127.0.0.1:5173 |
| API | http://127.0.0.1:4310 |
| 健康检查 | http://127.0.0.1:4310/health |

浏览器打开：

```text
http://127.0.0.1:5173/?view=canvas&tenant=demo&project=north-plant&user=local-user
```

未导入案例时，画布是可用的空状态或演示画布，图纸区会提示尚未加载案例。这是正常现象。

---

## 换端口

不要与本机已有进程冲突。例如：

```bash
# macOS / Linux
PORT=4311 WEB_PORT=5174 VITE_API_PROXY_TARGET=http://127.0.0.1:4311 npm run dev
```

```powershell
# Windows PowerShell
$env:PORT="4311"
$env:WEB_PORT="5174"
$env:VITE_API_PROXY_TARGET="http://127.0.0.1:4311"
npm run dev
```

- `PORT` / `ODF_API_HOST`：API 监听地址  
- `WEB_PORT` / `WEB_HOST`：前端开发服务器  
- `VITE_API_PROXY_TARGET`：前端把 `/api` 代理到哪个 API。必须与 API 实际地址一致。

---

## 导入你自己的案例（可选，仅本机）

系统提供通用案例导入：把**你有权使用**的案例目录放在本机，例如 `data/cases/my-case/`（该目录已被忽略，不会进 Git），然后调用导入接口。也可以先试用仓库内的合成示例 `examples/demo-loop/`（公开、非敏感，**不是**某套真实工厂案例的拷贝或脱敏版）。

案例目录建议包含：

| 文件名 | 作用 | 是否必须 |
| --- | --- | --- |
| `graph.ndjson` 或 `graph.json` | 图谱（Neo4j 风格 NDJSON） | 必须 |
| `points.xml` 或 `point-table.xml` | 点表 | 可选 |
| `shared-pipe.xlsx` | 共管表 | 可选 |
| `risk.doc` / `risk.docx` | 风险分析文档 | 可选 |
| `pms.pdf` | PMS 类说明 PDF | 可选 |
| `task.txt` | 任务/说明文本 | 可选 |
| `drawings.pdf` / `drawings.png` | 图纸附件 | 可选 |

导入（默认 API 已在 4310 运行，开发代理会为来自本机的请求签发短时开发令牌；若你直连 API，请按开发文档附带签名令牌）：

开发模式下若启用了 `ODF_SEED=true`，可用演示用户 `harper.dennis`（该项目 owner）导入。请同时带上租户/项目请求头。建议通过前端开发代理（默认 `http://127.0.0.1:5173/api/...`）发起导入：代理只为回环客户端签发短时开发令牌。不要把令牌或密钥写入仓库。

```bash
curl -fsS -X POST "http://127.0.0.1:5173/api/v1/cases/demo-loop/import?tenant=demo&project=north-plant" \
  -H "content-type: application/json" \
  -H "x-odf-user: harper.dennis" \
  -H "x-odf-tenant-id: demo" \
  -H "x-odf-project-id: north-plant" \
  --data '{"sourceDir":"examples/demo-loop"}'
```

`sourceDir` 必须位于允许根目录之内，默认包括：

- `ODF_CASE_DIR`（若已设置）
- `ODF_CASE_DATA_DIRS`（用系统路径分隔符分隔，Linux/macOS 为 `:`，Windows 为 `;`）
- 仓库下的 `data/cases/`、`examples/` 以及测试夹具目录

打开导入后的画布：

```text
http://127.0.0.1:5173/?view=canvas&tenant=demo&project=north-plant&user=local-user&case=demo-loop
```

分析结果中可查询合成位号 `DEMO-PT001`。

若要默认打开某个已导入案例，可在**私有** `.env` 中设置 `VITE_DEFAULT_CASE_KEY=demo-loop`（不要把真实工厂的案例键写进将要公开的文件）。

---

## 构建与测试

先按上一节装好 Python 依赖，再跑测试。类型检查和构建不读取 openpyxl，但 `npm test` 会。

```bash
# 类型检查（各工作区）
npm run typecheck

# 单元测试（需要已激活的 python3 能 import openpyxl）
npm test

# 生产构建
npm run build
```

前端构建使用 **Vite 8**（当前锁定 8.3.8）。不要用 Vite 7 启动 `apps/web`。

API 生产启动示例（先构建）：

```bash
npm run build --workspace @open-data-fusion/api
# 在已配置 .env 的仓库根目录
npm start --workspace @open-data-fusion/api
```

---

## 数据保存在哪里

| 内容 | 默认位置 | 说明 |
| --- | --- | --- |
| SQLite 数据库 | `apps/api/data/open-data-fusion.db` | 可用 `ODF_DATABASE_PATH` 改路径 |
| 对象/原始落地文件 | `apps/api/data/objects`、`apps/api/data/raw` | SQLite 单实例配置 |
| 开发签名密钥 | `apps/api/data/.odf-dev-secret` | 自动生成，权限应仅本人可读，**不要发布** |
| 画布布局 | 浏览器 `localStorage` | 每个案例键有独立键名 |

换用新的 `ODF_DATABASE_PATH` 可得到空白库；关掉 `ODF_SEED` 不会清空已经写入的旧库。

---

## 故障排查

### 前端资源 500，`Missing field moduleType`

几乎总是 **用错了 Vite 版本**。仓库是 npm workspaces：`apps/web` 依赖 Vite **8.1.x**，根 `node_modules` 里可能还有 vitest 带入的 Vite **7**。若用根目录的 `vite` 去起前端，`/@react-refresh`、`/@vite/client`、`/src/main.tsx` 会返回 500，页面空白。

正确做法：始终在仓库根目录执行 `npm run dev`（或 `scripts/dev.mjs` / `dev.sh` / `dev.ps1`）。不要手动运行：

```text
# 错误示例，不要用
node node_modules/vite/bin/vite.js
../../node_modules/.bin/vite
npx vite --version   # 若解析到 7.x 也不要用它启动 apps/web
```

确认前端用的是 8.x：

```bash
npm exec --workspace @open-data-fusion/web -- vite --version
```

### `EADDRINUSE` / 端口被占用

换用上面的 `PORT` / `WEB_PORT`，或结束占用 4310 / 5173 的进程。

### 打开页面但 API 404、导入失败

- 确认 API 已在目标端口监听（访问 `/health`）
- 确认 `VITE_API_PROXY_TARGET` 指向同一个 API
- 导入必须带 `sourceDir`，且目录在允许根之内；不要假设存在固定的 `/workspace/case` 路径
- 开发模式下，从非本机地址访问时，代理不会自动签发开发令牌，写操作可能被拒绝

### `npm ci` 失败

确认 Node 24+、npm 11+，并使用本仓库附带的 `package-lock.json`。可改试 `npm install`。

### 类型检查报错但测试通过

若你改动了画布组件的数据字段，请同步 `CanvasWidgetData` 类型后重新 `npm run typecheck`。

---

## 许可证与来源

- 许可证：[Apache License 2.0](LICENSE)
- 版权声明：[NOTICE](NOTICE)
- 上游：https://github.com/HaydernCenterpoint/Open-Data-Fusion
- 本软件独立开发，与 Cognite AS / Cognite Data Fusion **无隶属或背书关系**。

请保留 LICENSE 与 NOTICE。再次分发时遵守 Apache-2.0 的署名与声明要求。
