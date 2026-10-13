import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logEvent, resolveLogPath, withGuard } from "../../extensions/self-compact/log.ts";

function withLogPath<T>(fn: (path: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "self-compact-log-"));
	const prev = process.env.SELF_COMPACT_LOG;
	process.env.SELF_COMPACT_LOG = join(dir, "test.jsonl");
	try {
		return fn(join(dir, "test.jsonl"));
	} finally {
		if (prev === undefined) delete process.env.SELF_COMPACT_LOG;
		else process.env.SELF_COMPACT_LOG = prev;
		rmSync(dir, { recursive: true, force: true });
	}
}

function lines(path: string): Record<string, unknown>[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("logEvent appends one JSON line per event with an ISO ts", () => {
	withLogPath((path) => {
		logEvent({ event: "test_event", a: 1 });
		logEvent({ event: "test_event", a: 2 });
		const parsed = lines(path);
		assert.equal(parsed.length, 2);
		assert.ok(!Number.isNaN(Date.parse(String(parsed[0]!.ts))));
		assert.equal(parsed[1]!.a, 2);
	});
});

test("SELF_COMPACT_LOG=off writes nothing", () => {
	const prev = process.env.SELF_COMPACT_LOG;
	process.env.SELF_COMPACT_LOG = "off";
	try {
		assert.equal(resolveLogPath(), undefined);
		logEvent({ event: "never" });
	} finally {
		if (prev === undefined) delete process.env.SELF_COMPACT_LOG;
		else process.env.SELF_COMPACT_LOG = prev;
	}
});

test("rolls over to .1 past 5 MB", () => {
	withLogPath((path) => {
		writeFileSync(path, "x".repeat(5 * 1024 * 1024 + 1));
		logEvent({ event: "after_rollover" });
		assert.ok(existsSync(`${path}.1`));
		const parsed = lines(path);
		assert.equal(parsed.length, 1);
		assert.equal(parsed[0]!.event, "after_rollover");
	});
});

test("withGuard logs the exception with its site label and rethrows", () => {
	withLogPath((path) => {
		const fn = withGuard("test_site", () => {
			throw new Error("boom");
		});
		assert.throws(() => fn(), /boom/);
		const parsed = lines(path);
		assert.equal(parsed[0]!.event, "exception");
		assert.equal(parsed[0]!.where, "test_site");
		assert.equal(parsed[0]!.message, "boom");
	});
});
