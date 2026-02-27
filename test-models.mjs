import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

// Simplified getCliSpawnEnv
function getCliSpawnEnv() {
  return process.env;
}

const CODEX_MODELS_PROMPT = 'Output only a JSON array of model IDs from the Codex CLI /model menu. Example: ["gpt-5.3-codex","gpt-5.2-codex"]. No other text.';
const CLAUDE_MODELS_PROMPT = 'Output only a JSON array of model IDs from the Claude CLI /model menu. No other text.';
const GEMINI_MODELS_PROMPT = 'Output only a JSON array of model IDs from the Gemini CLI /model menu. No other text.';

const CLI_AUTH_CHECK_TIMEOUT_MS = 8_000;
const CLI_MODELS_QUERY_TIMEOUT_MS = 60_000;

function runCliCommand(executable, args, timeoutMs = CLI_AUTH_CHECK_TIMEOUT_MS) {
  const env = getCliSpawnEnv();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`CLI check timed out after ${timeoutMs / 1000}s. The CLI may be slow to start or hung.`)),
      timeoutMs,
    ),
  );
  if (process.platform === 'win32') {
    const fullCmd = [executable, ...args].map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
    return Promise.race([
      execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', fullCmd], {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env,
      }),
      timeoutPromise,
    ]);
  }
  return Promise.race([
    execFileAsync(executable, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env,
    }),
    timeoutPromise,
  ]);
}

async function queryCodexModelsViaExec() {
  const timeoutMs = 120_000;
  const env = getCliSpawnEnv();
  return new Promise((resolve, reject) => {
    const args = ['exec', '--sandbox', 'read-only', '--json', CODEX_MODELS_PROMPT];
    const proc =
      process.platform === 'win32'
        ? spawn('codex', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env,
          })
        : spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'], env });

    let stdout = '';
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr?.on('data', () => {});

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Codex CLI models query timed out'));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      function tryExtractIds(text) {
        try {
          const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim();
          const ids = JSON.parse(jsonStr);
          if (!Array.isArray(ids)) return null;
          return ids.filter((id) => typeof id === 'string' && id.length > 0);
        } catch {
          return null;
        }
      }
      try {
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.includes('item.completed') && !trimmed.includes('agent_message')) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type !== 'item.completed' || parsed.item?.type !== 'agent_message' || !parsed.item?.text) continue;
            const ids = tryExtractIds(parsed.item.text);
            if (ids && ids.length > 0) {
              resolve(ids.map((id) => ({ id, displayName: id })));
              return;
            }
          } catch {
            continue;
          }
        }
        const start = stdout.indexOf('[');
        const end = stdout.lastIndexOf(']');
        if (start >= 0 && end > start) {
          const ids = tryExtractIds(stdout.slice(start, end + 1));
          if (ids && ids.length > 0) {
            resolve(ids.map((id) => ({ id, displayName: id })));
            return;
          }
        }
        resolve([]);
      } catch {
        resolve([]);
      }
    });
  });
}

async function queryClaudeModelsViaExec() {
  try {
    const result = await runCliCommand(
      'claude',
      ['-p', CLAUDE_MODELS_PROMPT, '--output-format', 'json', '--tools', ''],
      CLI_MODELS_QUERY_TIMEOUT_MS,
    );
    const out = (result.stdout ?? '').trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    let jsonStr = (parsed.result ?? '').trim();
    if (!jsonStr) return [];
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    const ids = JSON.parse(jsonStr);
    if (!Array.isArray(ids)) return [];
    return ids
      .filter((id) => typeof id === 'string' && id.length > 0)
      .map((id) => ({ id, displayName: id }));
  } catch (err) {
    console.error('Claude error:', err.message);
    return [];
  }
}

async function getGeminiAvailableModels() {
  const timeoutMs = 45_000;
  const env = getCliSpawnEnv();
  return new Promise((resolve, reject) => {
    const args = ['-o', 'json', '-p', GEMINI_MODELS_PROMPT];
    const proc =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env,
          })
        : spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'], env });

    let stdout = '';
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr?.on('data', () => {});

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Gemini CLI models query timed out'));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout || '{}');
        const response = parsed?.response?.trim();
        if (!response) {
          resolve([]);
          return;
        }
        let jsonStr = response;
        const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        const ids = JSON.parse(jsonStr);
        if (!Array.isArray(ids)) {
          resolve([]);
          return;
        }
        const result = ids
          .filter((id) => typeof id === 'string' && id.length > 0)
          .map((id) => ({
            id: id.replace(/^models\//, ''),
            displayName: id.replace(/^models\//, ''),
          }));
        resolve(result);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

async function fetchOpenRouterModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    const free = models
      .filter((m) => typeof m?.id === 'string')
      .map((m) => ({
        id: String(m.id),
        displayName: String(m.id),
        isFree:
          String(m?.id).includes(':free') ||
          (m?.pricing?.prompt === '0' && m?.pricing?.completion === '0'),
      }));
    const picked = free.filter((m) => m.isFree).slice(0, 24);
    if (picked.length > 0) return picked.map(({ id, displayName }) => ({ id, displayName }));
    return free.slice(0, 24).map(({ id, displayName }) => ({ id, displayName }));
  } catch (err) {
    console.error('OpenRouter error:', err.message);
    return [];
  }
}

async function getAvailableModels() {
  console.log('Fetching codex...');
  const codex = await queryCodexModelsViaExec().catch((err) => { console.error('Codex global err', err); return [] });
  console.log('Fetching claude...');
  const claude = await queryClaudeModelsViaExec().catch((err) => { console.error('Claude global err', err); return [] });
  console.log('Fetching gemini...');
  const gemini = await getGeminiAvailableModels().catch((err) => { console.error('Gemini global err', err); return [] });
  console.log('Fetching openrouter...');
  const openrouter = await fetchOpenRouterModels().catch((err) => { console.error('OR global err', err); return [] });
  return { codex, claude, gemini, openrouter };
}

getAvailableModels().then(res => {
  console.log('Finished!', Object.keys(res).map(k => `${k}: ${res[k].length}`));
}).catch(err => {
  console.error('FATAL ERROR:', err);
});