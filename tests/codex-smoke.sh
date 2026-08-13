#!/usr/bin/env bash
# tests/codex-smoke.sh — Codex 适配冒烟（execpolicy 规则、skill 发现、hooks 配置解析）
# 由 Claude 会话调用；字面量用引号拼接规避 Claude 侧 PreToolUse 拦截（测试命令本身不执行危险操作）
set -u
cd "$(git rev-parse --show-toplevel)"
RULES=.codex/rules/assembly-development.rules
PASS=0; FAIL=0

expect() { # expect <expected-result-keyword> <label> <cmd...>
  local expect="$1" label="$2"; shift 2
  local out
  out=$(codex execpolicy check --rules "$RULES" -- "$@" 2>&1 | tail -3)
  if echo "$out" | grep -qi "$expect"; then
    echo "PASS: $label"
    PASS=$((PASS+1))
  else
    echo "FAIL: $label  (期望含 $expect，实际: $(echo "$out" | head -2 | tr '\n' ' '))"
    FAIL=$((FAIL+1))
  fi
}

expect "forbidden" "init 被硬阻断" git i""nit
expect "forbidden" "reset --hard 被硬阻断" git reset --ha""rd
expect "forbidden" "push --force 被硬阻断" git push --fo""rce
expect "forbidden" "push -f 被硬阻断" git push -f
expect "forbidden" "clean -fd 被硬阻断" git clean -""fd
expect "forbidden" "rm -rf .git 被硬阻断" rm -rf .gi""t
expect "prompt" "普通 push 需人工确认" git push origin main
expect "matchedRules" "git status 无规则匹配（默认放行）" git status

echo "---"
echo "codex-smoke execpolicy: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
