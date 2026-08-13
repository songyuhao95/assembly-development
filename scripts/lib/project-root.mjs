// lib/project-root.mjs — 项目目录解析（运行时与项目分离的关键）
//
// 流水线脚本安装于用户级运行时（默认 ~/.assembly-development），
// 工作对象是"当前项目"：优先 ASM_PROJECT_DIR 环境变量，否则进程 cwd。
import path from 'node:path';

export function projectRoot() {
  if (process.env.ASM_PROJECT_DIR) return path.resolve(process.env.ASM_PROJECT_DIR);
  return process.cwd();
}
