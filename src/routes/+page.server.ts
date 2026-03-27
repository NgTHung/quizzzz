import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { questions } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(questions).orderBy(questions.id);
	return { questions: rows };
};
