import { spawn } from 'node:child_process';
import { WorkManagerError } from './errors.js';

export interface CommandResult { code: number; stdout: string; stderr: string; }

export interface CommandRunner {
  run(argv: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
}

export class SystemCommandRunner implements CommandRunner {
  run(argv: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<CommandResult> {
    if (!argv.length) throw new WorkManagerError('COMMAND_EMPTY', '外部命令不能为空');
    return new Promise((resolve, reject) => {
      const child = spawn(argv[0]!, argv.slice(1), { cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let settled = false;
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(new WorkManagerError('COMMAND_TIMEOUT', `${argv[0]} 执行超时`, {
          recoverable: true, details: { command: argv[0], timeoutMs: options.timeoutMs ?? 30_000 }
        }));
      }, options.timeoutMs ?? 30_000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new WorkManagerError('COMMAND_START_FAILED', error.message, { recoverable: true }));
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const result = { code: code ?? -1, stdout, stderr };
        if (result.code === 0) resolve(result);
        else reject(new WorkManagerError('COMMAND_FAILED', stderr.trim() || `${argv[0]} 退出码 ${result.code}`, {
          recoverable: true, details: { command: argv[0], exitCode: result.code }
        }));
      });
    });
  }
}

export function parseCommandLine(command: string | string[]): string[] {
  if (Array.isArray(command)) return [...command];
  const result: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of command.trim()) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\s/.test(character)) {
      if (current) { result.push(current); current = ''; }
      continue;
    }
    if ('|&;<>'.includes(character)) {
      throw new WorkManagerError('COMMAND_SHELL_OPERATOR_FORBIDDEN', `开发服务命令不能包含 shell 操作符：${character}`);
    }
    current += character;
  }
  if (quote) throw new WorkManagerError('COMMAND_QUOTE_UNCLOSED', '开发服务命令存在未闭合引号');
  if (escaped) current += '\\';
  if (current) result.push(current);
  if (!result.length) throw new WorkManagerError('COMMAND_EMPTY', '开发服务命令不能为空');
  return result;
}
