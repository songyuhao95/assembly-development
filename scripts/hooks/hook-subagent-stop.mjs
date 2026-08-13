// hooks/hook-subagent-stop.mjs — SubagentStop：
// 记录停止事件；合同报告缺失时写 risk.triggered。**绝不 exit 2**（防停止循环）。
import { existsSync } from 'node:fs';
import path from 'node:path';
import { activeRun, eventsPath, event, readStdin, reportsDir } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const input = readStdin();
const run = activeRun(input);
if (!run) process.exit(0);

const agentId = input.agent_id || null;
const result = input.tool_response && input.tool_response.result;
const resultText = typeof result === 'string' ? result : JSON.stringify(result || '');

// 尽力提取 task/contract 引用（不信任，仅用于报告存在性检查）
const taskMatch = resultText.match(/(?:task_id|TASK_ID|taskId)\s*[:=]\s*(T-\d{3})/);
const taskId = taskMatch ? taskMatch[1] : null;
const reportPath = taskId ? path.join(reportsDir(input), `${taskId}-report.json`) : null;
const hasReport = reportPath && existsSync(reportPath);

appendEvent(eventsPath(input), event('subagent.stop', run, {
  hasReport: Boolean(hasReport),
  resultLength: resultText.length,
  resultTail: resultText.slice(-400),
}, { agentId, taskId }));

if (taskId && !hasReport) {
  appendEvent(eventsPath(input), event('risk.triggered', run, {
    id: `missing-report-${taskId}`,
    level: 'high',
    condition: `subagent 停止时未找到任务报告 run/reports/${taskId}-report.json`,
    verifyTaskId: null,
  }, { taskId }));
}
process.exit(0);
