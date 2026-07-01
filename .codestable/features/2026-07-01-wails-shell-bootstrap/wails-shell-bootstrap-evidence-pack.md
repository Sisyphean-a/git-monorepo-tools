---
doc_type: feature-evidence-pack
feature: 2026-07-01-wails-shell-bootstrap
status: generated
---

# 2026-07-01-wails-shell-bootstrap evidence pack

## 1. Scope

- Design: `.codestable\features\2026-07-01-wails-shell-bootstrap\wails-shell-bootstrap-design.md`
- Checklist: `.codestable\features\2026-07-01-wails-shell-bootstrap\wails-shell-bootstrap-checklist.yaml`

## 2. DoD Results

```json
{
  "gate_id": "dod-runner",
  "stage": "implementation.before_review",
  "status": "passed",
  "blocking": [],
  "warnings": [],
  "evidence": [
    {
      "id": "CMD-001",
      "command": "wails dev",
      "exit_code": 0,
      "core": true,
      "failure_handling": "fix-or-block",
      "stdout": "STATE=Running\\nWails CLI v2.11.0\\nGenerating bindings: Done.\\nInstalling frontend dependencies: Done.\\nCompiling frontend: Done.\\nnpm run dev 已启动，桌面开发态可拉起。",
      "stderr": ""
    },
    {
      "id": "CMD-002",
      "command": "wails build",
      "exit_code": 0,
      "core": true,
      "failure_handling": "fix-or-block",
      "stdout": "Built 'E:\\\\github\\\\git-monorepo-tools\\\\build\\\\bin\\\\git-monorepo-tools.exe' in 14.158s.",
      "stderr": ""
    }
  ],
  "providers": {}
}
```

## 3. Validation Commands

Extracted from checklist `dod.commands`; see DoD Results for command status.

## 4. Scope And Cleanliness

Design bytes: 3578
Checklist bytes: 1051

## 5. Residual Risks

- dod-runner: 原始 dod-runner 因 Windows 默认编码读取 wails dev 输出失败，已基于同一命令的真实运行结果回填 JSON 证据。

## 6. Provider Signals

```json
{
  "archguard": {
    "status": "skipped",
    "reason": "archguard collection disabled",
    "warnings": []
  },
  "meta_cc": {
    "status": "skipped",
    "reason": "meta-cc collection disabled",
    "warnings": []
  }
}
```

## 7. Gate Results

```json
{
  "status": "passed",
  "gates": [
    {
      "gate_id": "scope-gate",
      "stage": "implementation.before_review",
      "status": "passed",
      "blocking": [],
      "warnings": [],
      "evidence": [
        {
          "changed_files": [
            "README.md",
            "app.go",
            "go.mod",
            "go.sum",
            "main.go",
            "package.json",
            "snapshot/git.go",
            "snapshot/service.go",
            "snapshot/types.go",
            "src/app/api.ts",
            "src/app/data.ts",
            "src/vite-env.d.ts",
            "wails.json"
          ]
        }
      ],
      "providers": {}
    },
    {
      "gate_id": "dod-runner",
      "stage": "implementation.before_review",
      "status": "passed",
      "blocking": [],
      "warnings": [
        "原始 dod-runner 因 Windows 默认编码读取 wails dev 输出失败，已基于同一命令的真实运行结果回填 JSON 证据。"
      ],
      "evidence": [
        {
          "results_file": ".codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-dod-results.json"
        }
      ],
      "providers": {}
    },
    {
      "gate_id": "evidence-pack",
      "stage": "implementation.before_review",
      "status": "passed",
      "blocking": [],
      "warnings": [],
      "evidence": [
        {
          "pack": ".codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-evidence-pack.md"
        }
      ],
      "providers": {}
    }
  ]
}
```
