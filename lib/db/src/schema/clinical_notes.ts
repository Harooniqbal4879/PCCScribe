import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const NOTE_TYPES = [
  "progress_notes",
  "physician_orders",
  "mds_assessment",
  "care_plan",
  "mar",
  "nursing_notes",
  "therapy_notes",
  "dietary_notes",
  "social_work_notes",
  "other",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const clinicalNotesTable = pgTable("clinical_notes", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patientsTable.id, { onDelete: "cascade" })
    .notNull(),
  noteType: text("note_type").$type<NoteType>().notNull(),
  noteDate: text("note_date").notNull(),
  author: text("author"),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  source: text("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClinicalNoteSchema = createInsertSchema(
  clinicalNotesTable
).omit({ id: true, createdAt: true });

export type InsertClinicalNote = z.infer<typeof insertClinicalNoteSchema>;
export type ClinicalNote = typeof clinicalNotesTable.$inferSelect;
