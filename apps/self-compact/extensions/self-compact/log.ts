/**
 * self-compact diagnostic log: an append-only JSONL file recording the
 * extension's compaction lifecycle and exceptions, so failures can be
 * analyzed after the fact.
 *
 * The log must never throw: a logging failure must not disturb the agent.
 * Path: $SELF_COMPACT_LOG (a file path; "off" disables), defaulting to
 * ~/.pi/agent/logs/self-compact.jsonl. Rolls over to <path>.1 past 5 MB.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;

export type LogEvent = Record<string, unknown> & { event: string };

export function resolveLogPath(): string | undefined {
	const env = process.env.SELF_COMPACT_LOG;
	if (env === undefined) return resolve(homedir(), ".pi", "agent", "logs", "self-compact.jsonl");
	const value = env.trim();
	if (value === "" || value.toLowerCase() === "off") return undefined;
	return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function logEvent(event: LogEvent): void {
	try {
		const path = resolveLogPath();
		if (path === undefined) return;
		if (event.ts === undefined) event.ts = new Date().toISOString();
		const line = `${JSON.stringify(event)}\n`;
		try {
			if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`);
		} catch {
			// File does not exist yet (or stat failed): nothing to roll over.
		}
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, line);
	} catch {
		// A logging failure must never propagate into the agent.
	}
}

/** Wrap a hook or callback: log any exception (with a site label) and rethrow. */
export function withGuard<A extends unknown[], R>(label: string, fn: (...args: A) => R): (...args: A) => R {
	return (...args: A): R => {
		try {
			return fn(...args);
		} catch (error) {
			logEvent({
				event: "exception",
				level: "error",
				where: label,
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	};
}
