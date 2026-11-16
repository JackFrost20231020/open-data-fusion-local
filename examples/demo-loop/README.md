# 合成演示案例 demo-loop

此目录是公开、非敏感的小型合成夹具，用于验证本地导入和图纸选择。它**不是**任何真实工厂或 RCS 案例的拷贝或脱敏版。

包含：

- `graph.ndjson`：两页合成图谱（`1-DEMO-001`、`2-DEMO-001`），含仪表 `DEMO-PT001` / `DEMO-LT002` 和一段管道
- `points.xml`：合成点表
- `shared-pipe.xlsx`：合成共管表
- `task.txt`：合成说明（演示任务位号 `DEMO-PT000` 与图谱位号 `DEMO-PT001` 并存，不合并）

## 导入（在仓库根目录，开发服务已启动）

Linux / macOS:

```bash
curl -fsS -X POST "http://127.0.0.1:5173/api/v1/cases/demo-loop/import?tenant=demo&project=north-plant" \
  -H "content-type: application/json" \
  -H "x-odf-user: harper.dennis" \
  -H "x-odf-tenant-id: demo" \
  -H "x-odf-project-id: north-plant" \
  --data '{"sourceDir":"examples/demo-loop"}'
```

Windows PowerShell:

```powershell
curl.exe -fsS -X POST "http://127.0.0.1:5173/api/v1/cases/demo-loop/import?tenant=demo&project=north-plant" `
  -H "content-type: application/json" `
  -H "x-odf-user: harper.dennis" `
  -H "x-odf-tenant-id: demo" `
  -H "x-odf-project-id: north-plant" `
  --data '{"sourceDir":"examples/demo-loop"}'
```

然后打开：

```text
http://127.0.0.1:5173/?view=canvas&tenant=demo&project=north-plant&user=local-user&case=demo-loop
```

在分析结果中查询位号 `DEMO-PT001`。
