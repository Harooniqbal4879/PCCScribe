import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const CONTENT_QUALITY = ["full", "truncated"] as const;
export type ContentQuality = (typeof CONTENT_QUALITY)[number];

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
  printUrl: text("print_url"),
  noteTypePcc: text("note_type_pcc"),
  source: text("source").default("manual").notNull(),
  // Dedup key: stable hash of (patientId|noteDate|noteTypePcc|author)
  pccFingerprint: text("pcc_fingerprint"),
  // Whether we have full extracted text or just the truncated table preview
  contentQuality: text("content_quality").$type<ContentQuality>().default("truncated").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Partial unique index — only enforced where pcc_fingerprint IS NOT NULL
  // This lets manually-entered notes (no fingerprint) coexist freely
  uniqueIndex("clinical_notes_pcc_fingerprint_idx")
    .on(table.pccFingerprint)
    .where(sql`pcc_fingerprint IS NOT NULL`),
]);

export const insertClinicalNoteSchema = createInsertSchema(
  clinicalNotesTable
).omit({ id: true, createdAt: true });

export type InsertClinicalNote = z.infer<typeof insertClinicalNoteSchema>;
export type ClinicalNote = typeof clinicalNotesTable.$inferSelect;
