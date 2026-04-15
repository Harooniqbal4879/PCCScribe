import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const summariesTable = pgTable("summaries", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patientsTable.id, { onDelete: "cascade" })
    .notNull(),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  noteTypesIncluded: jsonb("note_types_included")
    .$type<string[]>()
    .notNull()
    .default([]),
  notesCount: integer("notes_count").default(0).notNull(),
  status: text("status")
    .$type<"pending" | "generating" | "completed" | "failed">()
    .default("pending")
    .notNull(),
  confidence: text("confidence").$type<"high" | "medium" | "low">(),
  oneLiner: text("one_liner"),
  soapSummary: jsonb("soap_summary"),
  perNoteTypeSummaries: jsonb("per_note_type_summaries"),
  keyClinicalEvents: jsonb("key_clinical_events").$type<
    Array<{ date: string; event: string; significance: "high" | "medium" | "low" }>
  >(),
  documentationGaps: jsonb("documentation_gaps").$type<string[]>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSummarySchema = createInsertSchema(summariesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSummary = z.infer<typeof insertSummarySchema>;
export type Summary = typeof summariesTable.$inferSelect;
