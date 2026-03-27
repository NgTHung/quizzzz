import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { questions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';

function authToken() {
	return createHash('sha256').update(env.ADMIN_PASSWORD ?? '').digest('hex');
}

function isAuth(cookies: import('@sveltejs/kit').Cookies): boolean {
	return !!env.ADMIN_PASSWORD && cookies.get('admin_auth') === authToken();
}

export const load: PageServerLoad = async ({ cookies }) => {
	if (!isAuth(cookies)) {
		return { authenticated: false as const, questions: [], total: 0 };
	}
	const rows = await db.select().from(questions).orderBy(questions.id);
	return { authenticated: true as const, questions: rows, total: rows.length };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (!env.ADMIN_PASSWORD) return fail(500, { loginError: 'ADMIN_PASSWORD chưa được cấu hình.' });
		if (password !== env.ADMIN_PASSWORD) return fail(401, { loginError: 'Mật khẩu không đúng.' });
		cookies.set('admin_auth', authToken(), {
			path: '/admin',
			httpOnly: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 7
		});
	},

	logout: async ({ cookies }) => {
		cookies.delete('admin_auth', { path: '/admin' });
	},

	update: async ({ request, cookies }) => {
		if (!isAuth(cookies)) return fail(401, { error: 'Không có quyền truy cập.' });
		const data = await request.formData();
		const id = Number(data.get('id'));
		const question = String(data.get('question') ?? '').trim();
		const ans1 = String(data.get('ans1') ?? '').trim();
		const ans2 = String(data.get('ans2') ?? '').trim();
		const ans3 = String(data.get('ans3') ?? '').trim() || null;
		const ans4 = String(data.get('ans4') ?? '').trim() || null;
		const correctAnsIndex = Number(data.get('correct_ans_index'));
		const reason = String(data.get('reason') ?? '').trim();

		if (!question || !ans1 || !ans2 || !correctAnsIndex || !reason) {
			return fail(400, { error: 'Thiếu các trường bắt buộc.' });
		}
		if (ans4 && !ans3) {
			return fail(400, { error: 'Đáp án 4 không thể có nếu đáp án 3 trống.' });
		}
		const answerCount = 2 + (ans3 ? 1 : 0) + (ans4 ? 1 : 0);
		if (correctAnsIndex < 1 || correctAnsIndex > answerCount) {
			return fail(400, { error: `Đáp án đúng phải từ 1 đến ${answerCount}.` });
		}

		await db
			.update(questions)
			.set({ question, ans1, ans2, ans3, ans4, correctAnsIndex, reason })
			.where(eq(questions.id, id));
	},

	delete: async ({ request, cookies }) => {
		if (!isAuth(cookies)) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.delete(questions).where(eq(questions.id, id));
	},

	upload: async ({ request, cookies }) => {
		if (!isAuth(cookies)) return fail(401, { error: 'Unauthorized.' });

		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'No file provided.' });
		if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
			return fail(400, { error: 'Only .xlsx or .xls files are accepted.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const workbook = XLSX.read(buffer, { type: 'buffer' });
		const sheet = workbook.Sheets[workbook.SheetNames[0]];

		// Use column indices: A=câu hỏi, B=đ1, C=đ2, D=đ3, E=đ4, F=đáp án đúng, G=giải thích
		const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
		const dataRows = allRows.slice(1).filter((r): r is unknown[] => Array.isArray(r) && r.some((c) => c !== null && c !== ''));

		if (dataRows.length === 0) return fail(400, { error: 'Bảng tính không có dòng dữ liệu.' });

		const parsed: Array<typeof questions.$inferInsert> = [];

		for (let i = 0; i < dataRows.length; i++) {
			const row = dataRows[i];
			const rowNum = i + 2; // +2: 1-based + header row

			const question = String(row[0] ?? '').trim();
			const ans1 = String(row[1] ?? '').trim();
			const ans2 = String(row[2] ?? '').trim();
			const ans3 = String(row[3] ?? '').trim() || null;
			const ans4 = String(row[4] ?? '').trim() || null;
			const correctAnsIndex = Number(row[5] ?? 0);
			const reason = String(row[6] ?? '').trim();

			if (!question || !ans1 || !ans2 || !correctAnsIndex || !reason) {
				return fail(400, {
					error: `Dòng ${rowNum}: thiếu trường bắt buộc (cột A, B, C, F, G).`
				});
			}
			if (ans4 && !ans3) {
				return fail(400, { error: `Dòng ${rowNum}: cột E (đáp án 4) có giá trị nhưng cột D (đáp án 3) trống.` });
			}
			const answerCount = 2 + (ans3 ? 1 : 0) + (ans4 ? 1 : 0);
			if (correctAnsIndex < 1 || correctAnsIndex > answerCount) {
				return fail(400, { error: `Dòng ${rowNum}: cột F (đáp án đúng) phải từ 1 đến ${answerCount}.` });
			}

			parsed.push({ question, ans1, ans2, ans3, ans4, correctAnsIndex, reason });
		}

		await db.delete(questions);
		await db.insert(questions).values(parsed);
		return { uploadSuccess: true, count: parsed.length };
	}
};
