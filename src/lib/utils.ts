import { HTTPError, RequestError, TimeoutError } from 'got';
import type { ChildProcess } from 'node:child_process';

export function handleGotError(error: unknown, label: string, action: 'silence'): false;
export function handleGotError(error: unknown, label: string, action: 'throw'): never;
export function handleGotError(
  error: unknown,
  label: string,
  action: 'silence' | 'throw'
): false | never {
  let message: string;

  if (error instanceof HTTPError) {
    message = `API error while ${label}: ${error.response.statusCode}: ${JSON.stringify(error.response.body)}`;
  } else if (error instanceof TimeoutError) {
    message = `Request timed out while ${label} at phase: ${error.event}`;
  } else if (error instanceof RequestError) {
    message = `Network error while ${label}: [${error.code}]: ${error.message}`;
  } else if (action === 'throw') {
    throw error;
  } else {
    console.error(error);
    return false;
  }

  if (action === 'throw') {
    throw new Error(message);
  }

  console.error(message);
  return false;
}

export function attachAbortSignalToChild(child: ChildProcess, signal: AbortSignal): void {
  signal.addEventListener(
    'abort',
    () => {
      if (child.pid && !child.killed) {
        const reason = signal.reason as NodeJS.Signals | undefined;
        try {
          process.kill(-child.pid, reason ?? 'SIGTERM');
        } catch {
          // Ignore if the process group is already terminated.
        }
      }
    },
    { once: true }
  );
}
