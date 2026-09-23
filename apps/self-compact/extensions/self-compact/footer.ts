/**
 * Pure helpers for the native-layout footer.
 *
 * The custom footer reproduces Pi's built-in FooterComponent layout (pwd line,
 * token/cost stats, model on the right, extension-status line) and replaces only
 * the context-percentage segment with the self-compact bar. These helpers mirror
 * /opt/pi/packages/coding-agent/src/modes/interactive/components/footer.ts and
 * src/core/usage-totals.ts so the numbers match the built-in footer exactly.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Format token counts for compact footer display (mirrors FooterComponent.formatTokens). */
export function footerFormatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/** Replace home directory with ~ in the pwd shown by the footer (mirrors FooterComponent.formatCwdForFooter). */
export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));
	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

/** Sanitize text for a single-line footer display (mirrors FooterComponent.sanitizeStatusText). */
export function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export interface SessionUsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	/** Cache hit rate of the most recent assistant response, or null when not yet computable. */
	cacheHitRate: number | null;
}

type UsageLike = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } };
type EntryLike = {
	type?: string;
	usage?: UsageLike;
	message?: { role?: string; usage?: UsageLike };
};

/**
 * Cumulative usage across ALL session entries (mirrors FooterComponent.render +
 * usage-totals.ts: assistant messages, usage entries, tool results, branch summaries
 * and compactions all count; cost is precomputed per usage record).
 */
export function computeUsageTotals(entries: EntryLike[]): SessionUsageTotals {
	const totals: SessionUsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, cacheHitRate: null };
	const add = (u?: UsageLike) => {
		if (!u) return;
		totals.input += u.input ?? 0;
		totals.output += u.output ?? 0;
		totals.cacheRead += u.cacheRead ?? 0;
		totals.cacheWrite += u.cacheWrite ?? 0;
		totals.cost += u.cost?.total ?? 0;
	};
	for (const entry of entries) {
		if (entry.type === "usage") {
			add(entry.usage);
		} else if (entry.type === "message" && entry.message?.role === "assistant") {
			add(entry.message.usage);
			const u = entry.message.usage;
			const prompt = (u?.input ?? 0) + (u?.cacheRead ?? 0) + (u?.cacheWrite ?? 0);
			totals.cacheHitRate = prompt > 0 ? ((u?.cacheRead ?? 0) / prompt) * 100 : null;
		} else if (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.usage) {
			add(entry.message.usage);
		} else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
			add(entry.usage);
		}
	}
	return totals;
}
