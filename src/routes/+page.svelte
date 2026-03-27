<script lang="ts">
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import type { PageData } from './$types';
	import {
		buildActiveQuestion,
		selectSessionQuestions,
		selectNextQuestions,
		selectOldQuestions
	} from '$lib/quiz';
	import type { ActiveQuestion, Question } from '$lib/quiz';

	let { data }: { data: PageData } = $props();

	// ── LocalStorage ────────────────────────────────────────────────────────────

	const SEEN_KEY = 'quizer_seen_ids';
	const SESSION_KEY = 'quizer_session';

	type SavedSession = { questionIds: number[]; currentIndex: number; score: number };

	function loadSeenIds(): Set<number> {
		if (!browser) return new Set();
		try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as number[]); }
		catch { return new Set(); }
	}

	function saveSeenIds(ids: Set<number>) {
		if (!browser) return;
		localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
	}

	function loadSavedSession(): SavedSession | null {
		if (!browser) return null;
		try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as SavedSession | null; }
		catch { return null; }
	}

	function persistSession() {
		if (!browser || mode !== 'structured') return;
		const saved: SavedSession = {
			questionIds: shuffled.map((q) => q.id),
			currentIndex,
			score
		};
		localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
	}

	function clearSavedSession() {
		if (browser) localStorage.removeItem(SESSION_KEY);
	}

	// ── Core state ───────────────────────────────────────────────────────────────

	type Phase = 'home' | 'quiz' | 'result' | 'bank';
	type Mode = 'quick' | 'structured' | 'review' | 'custom';

	type QuizResult = {
		question: Question;
		chosenIndex: number | null;
		correctIndex: number;
		correct: boolean;
	};

	let phase = $state<Phase>('home');
	let mode = $state<Mode>('quick');
	let shuffled = $state<Question[]>([]);
	let currentIndex = $state(0);
	let score = $state(0);
	let active = $state<ActiveQuestion | null>(null);

	let selectedSlotIndex = $state<number | null>(null);
	let revealed = $state(false);

	let sessionResults = $state<QuizResult[]>([]);
	let expandedResultIndex = $state<number | null>(null);

	let seenCount = $state(0);
	let savedSession = $state<SavedSession | null>(null);

	// Bank state
	let bankSearch = $state('');
	let selectedIds = $state(new Set<number>());

	if (browser) {
		seenCount = loadSeenIds().size;
		savedSession = loadSavedSession();
	}

	let total = $derived(shuffled.length);
	let hasAnswered = $derived(selectedSlotIndex !== null);
	let isLastQuestion = $derived(currentIndex === total - 1);
	let coveragePct = $derived(
		data.questions.length > 0 ? (seenCount / data.questions.length) * 100 : 0
	);
	let bankFiltered = $derived(
		bankSearch.trim() === ''
			? data.questions
			: data.questions.filter((q) =>
					q.question.toLowerCase().includes(bankSearch.trim().toLowerCase())
			  )
	);
	let selectedCount = $derived(selectedIds.size);
	let wrongResults = $derived(sessionResults.filter((r) => !r.correct));

	// ── Answer styling ────────────────────────────────────────────────────────────

	function answerClass(i: number): string {
		if (!active) return '';

		if (!hasAnswered) {
			return 'border-zinc-200 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50';
		}

		if (!revealed) {
			if (i === selectedSlotIndex) return 'border-zinc-400 bg-zinc-100 text-zinc-800';
			return 'border-zinc-200 text-zinc-800';
		}

		if (i === active.correctSlotIndex) return 'border-emerald-500 bg-emerald-50 text-emerald-800';
		if (i === selectedSlotIndex) return 'border-red-400 bg-red-50 text-red-700';
		return 'border-zinc-200 text-zinc-400';
	}

	// ── Mode helpers ─────────────────────────────────────────────────────────────

	function beginQuiz(questions: Question[], startIndex: number, startScore: number) {
		shuffled = questions;
		currentIndex = startIndex;
		score = startScore;
		active = buildActiveQuestion(shuffled[currentIndex]);
		selectedSlotIndex = null;
		revealed = false;
		sessionResults = [];
		expandedResultIndex = null;
		phase = 'quiz';
	}

	function startQuick() {
		mode = 'quick';
		const seen = loadSeenIds();
		const picked = selectSessionQuestions(data.questions, seen, 50);
		beginQuiz(picked, 0, 0);
	}

	function startStructured(fresh = false) {
		mode = 'structured';

		if (!fresh && savedSession) {
			const idMap = new Map(data.questions.map((q) => [q.id, q]));
			const reconstructed = savedSession.questionIds
				.map((id) => idMap.get(id))
				.filter((q): q is Question => q !== undefined);

			if (reconstructed.length > 0) {
				beginQuiz(reconstructed, savedSession.currentIndex, savedSession.score);
				return;
			}
		}

		clearSavedSession();
		savedSession = null;
		const seen = loadSeenIds();
		const allSeen = seen.size >= data.questions.length;
		if (allSeen) {
			seen.clear();
			saveSeenIds(seen);
			seenCount = 0;
		}
		const picked = selectNextQuestions(data.questions, seen, data.questions.length);
		beginQuiz(picked, 0, 0);
		persistSession();
	}

	function startReview() {
		mode = 'review';
		const seen = loadSeenIds();
		const picked = selectOldQuestions(data.questions, seen, data.questions.length);
		if (picked.length === 0) return;
		beginQuiz(picked, 0, 0);
	}

	function startCustom(questions: Question[]) {
		mode = 'custom';
		beginQuiz([...questions], 0, 0);
	}

	function retryWrong() {
		const wrongIds = new Set(wrongResults.map((r) => r.question.id));
		const wrong = data.questions.filter((q) => wrongIds.has(q.id));
		if (wrong.length === 0) return;
		startCustom(wrong);
	}

	function startFromBank() {
		const selected = data.questions.filter((q) => selectedIds.has(q.id));
		if (selected.length === 0) return;
		startCustom(selected);
	}

	function goToBank(preselect: Set<number> = new Set()) {
		selectedIds = preselect;
		bankSearch = '';
		phase = 'bank';
	}

	// ── Quiz actions ─────────────────────────────────────────────────────────────

	let revealTimer: ReturnType<typeof setTimeout> | null = null;

	function selectAnswer(slotIndex: number) {
		if (hasAnswered || !active) return;
		selectedSlotIndex = slotIndex;

		if (revealTimer) clearTimeout(revealTimer);
		revealTimer = setTimeout(() => {
			revealed = true;
		}, 300);
	}

	function nextQuestion() {
		if (!active) return;

		const correct = selectedSlotIndex === active.correctSlotIndex;
		if (correct) score += 1;

		const chosenOriginal =
			selectedSlotIndex !== null ? active.slots[selectedSlotIndex].originalIndex : null;
		sessionResults = [
			...sessionResults,
			{
				question: active.question,
				chosenIndex: chosenOriginal,
				correctIndex: active.question.correctAnsIndex,
				correct
			}
		];

		if (isLastQuestion) {
			if (mode === 'structured') {
				const seen = loadSeenIds();
				for (const q of shuffled) seen.add(q.id);
				saveSeenIds(seen);
				clearSavedSession();
				seenCount = seen.size;
				savedSession = null;
			}
			phase = 'result';
			return;
		}

		currentIndex += 1;
		active = buildActiveQuestion(shuffled[currentIndex]);
		selectedSlotIndex = null;
		revealed = false;
		persistSession();
	}

	function goHome() {
		if (revealTimer) clearTimeout(revealTimer);
		seenCount = loadSeenIds().size;
		savedSession = loadSavedSession();
		phase = 'home';
	}

	function getAnswerLabel(q: Question, originalIndex: number): string {
		const map: Record<number, string | null> = { 1: q.ans1, 2: q.ans2, 3: q.ans3, 4: q.ans4 };
		return map[originalIndex] ?? '';
	}

	function trunc(text: string, maxLen = 60): string {
		return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
	}
</script>

<main class="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-10">
	{#if data.questions.length === 0}
		<!-- ── Trống ────────────────────────────────────────────────────────────── -->
		<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 w-full max-w-lg text-center">
			<p class="text-zinc-500">Chưa có câu hỏi nào. Vui lòng tải lên bộ câu hỏi từ trang quản trị.</p>
		</div>

	{:else if phase === 'home'}
		<!-- ── Trang chủ ──────────────────────────────────────────────────────── -->
		<div class="w-full max-w-lg flex flex-col gap-4">
			<div class="flex items-center justify-between mb-1">
				<div>
					<h1 class="text-2xl font-semibold text-zinc-900">Luyện Tập</h1>
					<p class="text-sm text-zinc-400 mt-1">{data.questions.length} câu hỏi</p>
				</div>
				<button
					onclick={() => goToBank()}
					class="text-sm text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-400"
				>
					Ngân hàng câu hỏi
				</button>
			</div>

			<!-- Luyện tập nhanh -->
			<button
				onclick={startQuick}
				class="w-full text-left bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 hover:border-zinc-300 transition-colors"
			>
				<p class="font-medium text-zinc-900">Luyện Tập Nhanh</p>
				<p class="text-sm text-zinc-400 mt-0.5">50 câu ngẫu nhiên · không lưu tiến trình</p>
			</button>

			<!-- Ôn tập toàn diện -->
			<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col gap-4">
				<div>
					<p class="font-medium text-zinc-900">Ôn Tập Toàn Diện</p>
					<p class="text-sm text-zinc-400 mt-0.5">Toàn bộ câu hỏi theo thứ tự, ưu tiên câu chưa ôn</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between text-xs text-zinc-400">
						<span>Câu đã ôn</span>
						<span>
							{Math.min(seenCount, data.questions.length)} / {data.questions.length}
							{#if seenCount >= data.questions.length}· đã hoàn thành, bắt đầu lại{/if}
						</span>
					</div>
					<div class="h-1 bg-zinc-100 rounded-full overflow-hidden">
						<div
							class="h-1 bg-zinc-500 rounded-full transition-all duration-500"
							style="width: {Math.min(coveragePct, 100)}%"
						></div>
					</div>
				</div>

				{#if savedSession}
					<div class="flex flex-col gap-2">
						<button
							onclick={() => startStructured(false)}
							class="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
						>
							Tiếp tục (Câu {savedSession.currentIndex + 1})
						</button>
						<button
							onclick={() => startStructured(true)}
							class="w-full py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:border-zinc-400 hover:text-zinc-900 transition-colors"
						>
							Bắt đầu phiên mới
						</button>
					</div>
				{:else}
					<button
						onclick={() => startStructured(false)}
						class="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
					>
						Bắt đầu
					</button>
				{/if}
			</div>

			<!-- Ôn lại câu cũ -->
			{#if seenCount > 0}
				<button
					onclick={startReview}
					class="w-full text-left bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 hover:border-zinc-300 transition-colors"
				>
					<p class="font-medium text-zinc-900">Ôn Lại Câu Cũ</p>
					<p class="text-sm text-zinc-400 mt-0.5">Toàn bộ {Math.min(seenCount, data.questions.length)} câu đã ôn · theo thứ tự ID</p>
				</button>
			{/if}
		</div>

	{:else if phase === 'bank'}
		<!-- ── Ngân hàng câu hỏi ──────────────────────────────────────────────── -->
		<div class="w-full max-w-lg flex flex-col gap-4">
			<div class="flex items-center gap-3">
				<button onclick={goHome} class="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">← Trang chủ</button>
				<h2 class="text-lg font-semibold text-zinc-900">Ngân hàng câu hỏi</h2>
			</div>

			<div class="flex gap-2">
				<input
					type="search"
					placeholder="Tìm câu hỏi…"
					bind:value={bankSearch}
					class="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:border-zinc-400 placeholder-zinc-400"
				/>
				{#if selectedCount > 0}
					<button
						onclick={() => (selectedIds = new Set())}
						class="px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors whitespace-nowrap"
					>
						Bỏ chọn
					</button>
				{/if}
			</div>

			<p class="text-xs text-zinc-400">{bankFiltered.length} câu{bankSearch ? ' phù hợp' : ''}</p>

			<div class="flex flex-col gap-2 pb-24">
				{#each bankFiltered as q}
					<button
						onclick={() => {
							const next = new Set(selectedIds);
							if (next.has(q.id)) next.delete(q.id);
							else next.add(q.id);
							selectedIds = next;
						}}
						class="w-full text-left bg-white rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors {selectedIds.has(q.id) ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300'}"
					>
						<span class="mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-xs font-bold transition-colors {selectedIds.has(q.id) ? 'bg-zinc-900 border-zinc-900 text-white' : 'border-zinc-300'}">
							{#if selectedIds.has(q.id)}✓{/if}
						</span>
						<span class="text-sm text-zinc-700 leading-snug">{q.question}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Sticky bottom bar -->
		{#if selectedCount > 0}
			<div transition:fade={{ duration: 150 }} class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-zinc-100 shadow-lg flex items-center gap-3">
				<span class="flex-1 text-sm text-zinc-500">Đã chọn {selectedCount} câu</span>
				<button
					onclick={startFromBank}
					class="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
				>
					Luyện tập →
				</button>
			</div>
		{/if}

	{:else if phase === 'quiz' && active}
		<!-- ── Câu hỏi ────────────────────────────────────────────────────────── -->
		<div class="w-full max-w-lg flex flex-col gap-6">
			<div class="flex flex-col gap-2">
				<div class="flex justify-between text-sm text-zinc-400">
					<button onclick={goHome} class="hover:text-zinc-600 transition-colors">← Trang chủ</button>
					<span>{score} đúng</span>
				</div>
				<div class="flex justify-center text-xs text-zinc-400">
					<span>Câu {currentIndex + 1} / {total}</span>
				</div>
				<div class="h-1 bg-zinc-200 rounded-full overflow-hidden">
					<div
						class="h-1 bg-zinc-500 rounded-full transition-all duration-300"
						style="width: {((currentIndex + 1) / total) * 100}%"
					></div>
				</div>
			</div>

			<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col gap-4">
				<p class="text-zinc-900 text-xl font-semibold leading-snug">
					{active.question.question}
				</p>

				<div class="flex flex-col gap-3">
					{#each active.slots as slot, i}
						<button
							class="w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors duration-200 cursor-pointer disabled:cursor-default {answerClass(i)}"
							disabled={hasAnswered}
							onclick={() => selectAnswer(i)}
						>
							{slot.label}
						</button>
					{/each}
				</div>

				{#if revealed}
					<div transition:fade={{ duration: 200 }}>
						<div class="p-4 bg-zinc-50 rounded-xl">
							<p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">Giải thích</p>
							<p class="text-zinc-600 text-sm leading-relaxed">{active.question.reason}</p>
						</div>
						<button
							class="mt-3 w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
							onclick={nextQuestion}
						>
							{isLastQuestion ? 'Xem kết quả' : 'Câu tiếp theo →'}
						</button>
					</div>
				{/if}
			</div>
		</div>

	{:else if phase === 'result'}
		<!-- ── Kết quả ────────────────────────────────────────────────────────── -->
		<div class="w-full max-w-lg flex flex-col gap-4">
			<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 flex flex-col items-center gap-4 text-center">
				<p class="text-zinc-400 text-sm uppercase tracking-wide font-semibold">Hoàn thành phiên</p>
				<p class="text-6xl font-bold text-zinc-900">
					{score}<span class="text-3xl text-zinc-300">/{total}</span>
				</p>
				<p class="text-zinc-500 text-base">
					{#if score === total}
						Xuất sắc!
					{:else if score >= Math.ceil(total * 0.7)}
						Tiến bộ tốt!
					{:else}
						Hãy ôn tập thêm và thử lại.
					{/if}
				</p>

				{#if mode === 'structured'}
					<div class="w-full flex flex-col gap-1.5 mt-1">
						<div class="flex justify-between text-xs text-zinc-400">
							<span>Tiến độ tổng thể</span>
							<span>{Math.min(seenCount, data.questions.length)} / {data.questions.length}</span>
						</div>
						<div class="h-1 bg-zinc-100 rounded-full overflow-hidden">
							<div
								class="h-1 bg-zinc-500 rounded-full transition-all duration-500"
								style="width: {Math.min(coveragePct, 100)}%"
							></div>
						</div>
					</div>
				{/if}

				<div class="w-full flex flex-col gap-2 mt-2">
					{#if wrongResults.length > 0}
						<button
							class="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
							onclick={retryWrong}
						>
							Luyện tập lại {wrongResults.length} câu sai →
						</button>
						<button
							class="w-full py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:border-zinc-400 hover:text-zinc-900 transition-colors"
							onclick={() => goToBank(new Set(wrongResults.map((r) => r.question.id)))}
						>
							Chọn câu để ôn tập
						</button>
					{/if}
					{#if mode === 'structured'}
						<button
							class="w-full py-3 rounded-xl {wrongResults.length > 0 ? 'border border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900' : 'bg-zinc-900 text-white hover:bg-zinc-700'} text-sm font-medium transition-colors"
							onclick={() => startStructured(true)}
						>
							Phiên tiếp theo →
						</button>
					{/if}
					<button
						class="w-full py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:border-zinc-400 hover:text-zinc-900 transition-colors"
						onclick={goHome}
					>
						Về trang chủ
					</button>
				</div>
			</div>

			<!-- Summary list -->
			{#if sessionResults.length > 0}
				<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
					<p class="px-5 py-4 text-sm font-semibold text-zinc-500 uppercase tracking-wide border-b border-zinc-100">
						Tổng kết phiên
					</p>
					<ul class="divide-y divide-zinc-100">
						{#each sessionResults as result, i}
							<li>
								<button
									class="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-zinc-50 transition-colors"
									onclick={() => (expandedResultIndex = expandedResultIndex === i ? null : i)}
								>
									<span class="mt-0.5 shrink-0 text-sm font-bold {result.correct ? 'text-emerald-500' : 'text-red-400'}">
										{result.correct ? '✓' : '✗'}
									</span>
									<span class="text-sm text-zinc-700 leading-snug">{trunc(result.question.question)}</span>
								</button>

								{#if expandedResultIndex === i}
									<div transition:fade={{ duration: 150 }} class="px-5 pb-4 flex flex-col gap-2">
										<p class="text-xs text-zinc-400 font-medium uppercase tracking-wide">Đáp án đúng</p>
										<p class="text-sm text-emerald-700 font-medium">
											{getAnswerLabel(result.question, result.correctIndex)}
										</p>
										{#if !result.correct && result.chosenIndex !== null}
											<p class="text-xs text-zinc-400 font-medium uppercase tracking-wide mt-1">Bạn chọn</p>
											<p class="text-sm text-red-600">
												{getAnswerLabel(result.question, result.chosenIndex)}
											</p>
										{/if}
										<p class="text-xs text-zinc-400 font-medium uppercase tracking-wide mt-1">Giải thích</p>
										<p class="text-sm text-zinc-600 leading-relaxed">{result.question.reason}</p>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</main>
