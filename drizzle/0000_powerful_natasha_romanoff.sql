CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"ans1" text NOT NULL,
	"ans2" text NOT NULL,
	"ans3" text NOT NULL,
	"ans4" text,
	"correct_ans_index" integer NOT NULL,
	"reason" text NOT NULL
);
