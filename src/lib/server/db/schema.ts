import { pgTable, serial, integer, text } from 'drizzle-orm/pg-core';

export const questions = pgTable('questions', {
	id: serial('id').primaryKey(),
	question: text('question').notNull(),
	ans1: text('ans1').notNull(),
	ans2: text('ans2').notNull(),
	ans3: text('ans3'),
	ans4: text('ans4'),
	correctAnsIndex: integer('correct_ans_index').notNull(),
	reason: text('reason').notNull()
});
