<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { Question } from '$lib/quiz';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// ── Helpers ──────────────────────────────────────────────────────────────────

	function trunc(text: string, max = 90) {
		return text.length > max ? text.slice(0, max) + '…' : text;
	}

	function correctAnswerText(q: Question): string {
		const map: Record<number, string | null | undefined> = {
			1: q.ans1, 2: q.ans2, 3: q.ans3, 4: q.ans4
		};
		return map[q.correctAnsIndex] ?? '';
	}

	// ── Upload section ────────────────────────────────────────────────────────────

	let dragging = $state(false);
	let fileName = $state('');
	let showUpload = $state(false);

	function handleDrop(e: DragEvent) {
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) fileName = file.name;
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
	}

	// ── Table: search + pagination ────────────────────────────────────────────────

	const PAGE_SIZE = 50;
	let search = $state('');
	let page = $state(1);

	let filtered = $derived(
		data.authenticated
			? search.trim()
				? data.questions.filter((q) =>
						q.question.toLowerCase().includes(search.trim().toLowerCase())
					)
				: data.questions
			: []
	);

	let totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

	// Reset to page 1 when search changes
	$effect(() => {
		search; // track
		page = 1;
	});

	let pageQuestions = $derived(
		filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
	);

	// ── Inline edit ───────────────────────────────────────────────────────────────

	let editingId = $state<number | null>(null);
	let editFields = $state({
		question: '', ans1: '', ans2: '', ans3: '', ans4: '',
		correct_ans_index: '1', reason: ''
	});

	function startEdit(q: Question) {
		editingId = q.id;
		editFields = {
			question: q.question,
			ans1: q.ans1,
			ans2: q.ans2,
			ans3: q.ans3 ?? '',
			ans4: q.ans4 ?? '',
			correct_ans_index: String(q.correctAnsIndex),
			reason: q.reason
		};
	}

	function cancelEdit() { editingId = null; }

	function updateEnhance() {
		return async ({ result, update }: { result: { type: string }; update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			if (result.type !== 'failure') editingId = null;
		};
	}
</script>

<main class="min-h-screen bg-zinc-50 px-4 py-10">

	{#if !data.authenticated}
		<!-- ── Login ──────────────────────────────────────────────────────────── -->
		<div class="flex items-center justify-center min-h-[80vh]">
			<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 w-full max-w-sm flex flex-col gap-5">
				<div>
					<h1 class="text-xl font-semibold text-zinc-900">Quản Trị</h1>
					<p class="text-sm text-zinc-400 mt-0.5">Nhập mật khẩu để tiếp tục.</p>
				</div>
				<form method="POST" action="?/login" use:enhance class="flex flex-col gap-3">
					<input
						type="password"
						name="password"
						placeholder="Mật khẩu"
						required
						class="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
					/>
					{#if form?.loginError}
						<p class="text-red-600 text-sm">{form.loginError}</p>
					{/if}
					<button
						type="submit"
						class="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
					>
						Đăng nhập
					</button>
				</form>
			</div>
		</div>

	{:else}
		<!-- ── Admin UI ───────────────────────────────────────────────────────── -->
		<div class="max-w-6xl mx-auto flex flex-col gap-6">

			<!-- Header -->
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-xl font-semibold text-zinc-900">Ngân Hàng Câu Hỏi</h1>
					<p class="text-sm text-zinc-400 mt-0.5">{data.total} câu hỏi</p>
				</div>
				<div class="flex items-center gap-3">
					<button
						onclick={() => (showUpload = !showUpload)}
						class="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:border-zinc-400 transition-colors"
					>
						{showUpload ? 'Ẩn tải lên' : 'Tải lên .xlsx'}
					</button>
					<form method="POST" action="?/logout" use:enhance>
						<button type="submit" class="px-4 py-2 rounded-xl text-zinc-400 text-sm hover:text-zinc-700 transition-colors">
							Đăng xuất
						</button>
					</form>
				</div>
			</div>

			<!-- Upload section (collapsible) -->
			{#if showUpload}
				<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col gap-4">
					<p class="text-sm font-medium text-zinc-700">
						Tải lên bảng tính
						<span class="font-normal text-zinc-400 ml-1">— thay thế toàn bộ câu hỏi hiện có</span>
					</p>
					<p class="text-xs text-zinc-400">
						Hàng đầu tiên là tiêu đề (bỏ qua). Dữ liệu theo cột:<br/>
						<code class="font-mono">A: câu hỏi · B: đáp án 1 · C: đáp án 2 · D: đáp án 3 (tùy chọn) · E: đáp án 4 (tùy chọn) · F: số đáp án đúng (1–4) · G: giải thích</code>
					</p>
					<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="flex flex-col gap-3">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<label
							class="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors"
							class:border-zinc-300={!dragging}
							class:border-zinc-500={dragging}
							class:bg-zinc-50={dragging}
							ondragover={(e) => { e.preventDefault(); dragging = true; }}
							ondragleave={() => { dragging = false; }}
							ondrop={(e) => { e.preventDefault(); handleDrop(e); }}
						>
							<svg class="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
									d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
							</svg>
							<span class="text-sm {fileName ? 'text-zinc-700 font-medium' : 'text-zinc-400'}">
								{fileName || 'Thả file .xlsx vào đây hoặc nhấn để chọn'}
							</span>
							<input type="file" name="file" accept=".xlsx,.xls" class="hidden" onchange={handleFileChange} />
						</label>
						<button type="submit" class="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
							Tải lên & Thay thế toàn bộ câu hỏi
						</button>
					</form>

					{#if form?.error}
						<p class="text-red-600 text-sm">{form.error}</p>
					{/if}
					{#if form?.uploadSuccess}
						<p class="text-emerald-700 text-sm">
							Đã nhập thành công {form.count} câu hỏi.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Search + pagination controls -->
			<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
				<input
					type="search"
					placeholder="Tìm kiếm câu hỏi…"
					bind:value={search}
					class="w-full sm:w-72 px-4 py-2 rounded-xl border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
				/>
				{#if totalPages > 1}
					<div class="flex items-center gap-2 text-sm text-zinc-500 shrink-0">
						<button
							onclick={() => (page = Math.max(1, page - 1))}
							disabled={page === 1}
							class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-30 hover:border-zinc-400 transition-colors"
						>←</button>
						<span>Trang {page} / {totalPages}</span>
						<button
							onclick={() => (page = Math.min(totalPages, page + 1))}
							disabled={page === totalPages}
							class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-30 hover:border-zinc-400 transition-colors"
						>→</button>
					</div>
				{/if}
			</div>

			<!-- Questions table -->
			{#if filtered.length === 0}
				<p class="text-zinc-400 text-sm py-8 text-center">Không tìm thấy câu hỏi.</p>
			{:else}
				<div class="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-zinc-100">
									<th class="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide w-12">#</th>
									<th class="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Câu hỏi</th>
									<th class="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide w-52">Đáp án đúng</th>
									<th class="px-4 py-3 w-28"></th>
								</tr>
							</thead>
							<tbody>
								{#each pageQuestions as q (q.id)}
									{#if editingId === q.id}
										<!-- Edit row -->
										<tr class="border-b border-zinc-100 bg-zinc-50">
											<td colspan="4" class="px-4 py-4">
												<form
													method="POST"
													action="?/update"
													use:enhance={updateEnhance}
													class="flex flex-col gap-3"
												>
													<input type="hidden" name="id" value={q.id} />

													<label class="flex flex-col gap-1">
														<span class="text-xs font-medium text-zinc-500">Câu hỏi</span>
														<textarea
															name="question"
															rows="3"
															bind:value={editFields.question}
															class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 resize-none transition-colors"
														></textarea>
													</label>

													<div class="grid grid-cols-2 gap-3">
														{#each ['ans1', 'ans2'] as field}
															<label class="flex flex-col gap-1">
																<span class="text-xs font-medium text-zinc-500">{field}</span>
																<input
																	type="text"
																	name={field}
																	bind:value={editFields[field as 'ans1' | 'ans2']}
																	class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
																/>
															</label>
														{/each}
														<label class="flex flex-col gap-1">
															<span class="text-xs font-medium text-zinc-500">ans3 <span class="text-zinc-300">(tùy chọn)</span></span>
															<input
																type="text"
																name="ans3"
																bind:value={editFields.ans3}
																class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
															/>
														</label>
														<label class="flex flex-col gap-1">
															<span class="text-xs font-medium text-zinc-500">ans4 <span class="text-zinc-300">(tùy chọn)</span></span>
															<input
																type="text"
																name="ans4"
																bind:value={editFields.ans4}
																class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
															/>
														</label>
													</div>

													<label class="flex flex-col gap-1 w-24">
														<span class="text-xs font-medium text-zinc-500">Đáp án đúng (1–4)</span>
														<input
															type="number"
															name="correct_ans_index"
															min="1"
															max="4"
															bind:value={editFields.correct_ans_index}
															class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 transition-colors"
														/>
													</label>

													<label class="flex flex-col gap-1">
														<span class="text-xs font-medium text-zinc-500">Giải thích</span>
														<textarea
															name="reason"
															rows="2"
															bind:value={editFields.reason}
															class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-zinc-500 resize-none transition-colors"
														></textarea>
													</label>

													{#if form?.error}
														<p class="text-red-600 text-xs">{form.error}</p>
													{/if}

													<div class="flex gap-2">
														<button
															type="submit"
															class="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-700 transition-colors"
														>Lưu</button>
														<button
															type="button"
															onclick={cancelEdit}
															class="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-xs font-medium hover:border-zinc-400 transition-colors"
														>Hủy</button>
													</div>
												</form>
											</td>
										</tr>
									{:else}
										<!-- Display row -->
										<tr class="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
											<td class="px-4 py-3 text-zinc-300 tabular-nums">{q.id}</td>
											<td class="px-4 py-3 text-zinc-800" title={q.question}>{trunc(q.question)}</td>
											<td class="px-4 py-3 text-zinc-500 text-xs" title={correctAnswerText(q)}>
												<span class="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium mr-1.5">{q.correctAnsIndex}</span>
												{trunc(correctAnswerText(q), 40)}
											</td>
											<td class="px-4 py-3">
												<div class="flex items-center justify-end gap-2">
													<button
														onclick={() => startEdit(q)}
														class="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100"
													>Sửa</button>
													<form
														method="POST"
														action="?/delete"
														use:enhance
														onsubmit={(e) => { if (!confirm('Xóa câu hỏi này?')) e.preventDefault(); }}
													>
														<input type="hidden" name="id" value={q.id} />
														<button
															type="submit"
															class="text-xs text-zinc-300 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
														>Xóa</button>
													</form>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<!-- Bottom pagination -->
				{#if totalPages > 1}
					<div class="flex items-center justify-center gap-2 text-sm text-zinc-500">
						<button
							onclick={() => (page = Math.max(1, page - 1))}
							disabled={page === 1}
							class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-30 hover:border-zinc-400 transition-colors"
						>← Trước</button>
						<span>Trang {page} / {totalPages}</span>
						<button
							onclick={() => (page = Math.min(totalPages, page + 1))}
							disabled={page === totalPages}
							class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-30 hover:border-zinc-400 transition-colors"
						>Tiếp →</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</main>
