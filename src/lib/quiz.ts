import type { InferSelectModel } from 'drizzle-orm';
import type { questions } from '$lib/server/db/schema';

export type Question = InferSelectModel<typeof questions>;

export type AnswerSlot = {
	label: string;
	originalIndex: number;
};

export type ActiveQuestion = {
	question: Question;
	slots: AnswerSlot[];
	correctSlotIndex: number;
};

function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function shuffleQuestions(qs: Question[]): Question[] {
	return shuffle([...qs]);
}

/**
 * Pick `count` questions, prioritising ones not in `seenIds`.
 * If all questions have been seen, clears and picks from the full set.
 */
export function selectSessionQuestions(
	all: Question[],
	seenIds: Set<number>,
	count: number
): Question[] {
	const unseen = shuffle(all.filter((q) => !seenIds.has(q.id)));

	// All seen — treat as a fresh slate
	if (unseen.length === 0) return shuffle([...all]).slice(0, count);

	// Enough unseen to fill the session
	if (unseen.length >= count) return unseen.slice(0, count);

	// Pad with random seen questions
	const seen = shuffle(all.filter((q) => seenIds.has(q.id)));
	return [...unseen, ...seen.slice(0, count - unseen.length)];
}

/** Pick the next `count` unseen questions in ascending ID order (systematic coverage). */
export function selectNextQuestions(
	all: Question[],
	seenIds: Set<number>,
	count: number
): Question[] {
	const unseen = all.filter((q) => !seenIds.has(q.id)).sort((a, b) => a.id - b.id);
	if (unseen.length === 0) return [...all].sort((a, b) => a.id - b.id).slice(0, count);
	return unseen.slice(0, count);
}

/** Pick up to `count` already-seen questions in ascending ID order (for review). */
export function selectOldQuestions(
	all: Question[],
	seenIds: Set<number>,
	count: number
): Question[] {
	return all
		.filter((q) => seenIds.has(q.id))
		.sort((a, b) => a.id - b.id)
		.slice(0, count);
}

export function buildActiveQuestion(q: Question): ActiveQuestion {
	const pool: AnswerSlot[] = [
		{ label: q.ans1, originalIndex: 1 },
		{ label: q.ans2, originalIndex: 2 },
		...(q.ans3 !== null ? [{ label: q.ans3, originalIndex: 3 }] : []),
		...(q.ans4 !== null ? [{ label: q.ans4, originalIndex: 4 }] : [])
	];

	const slots = shuffle([...pool]);
	const correctSlotIndex = slots.findIndex((s) => s.originalIndex === q.correctAnsIndex);

	return { question: q, slots, correctSlotIndex };
}
