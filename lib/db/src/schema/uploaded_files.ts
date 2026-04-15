import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const pccUploadedFilesTable = pgTable(
  "pcc_uploaded_files",
  {
    id: serial("id").primaryKey(),
    patientId: integer("patient_id")
      .references(() => patientsTable.id, { onDelete: "cascade" })
      .notNull(),
    pccFileId: text("pcc_file_id").notNull(),
    pccClientId: text("pcc_client_id").notNull(),
    storedName: text("stored_name").notNull(),
    displayName: text("display_name").notNull(),
    effectiveDate: text("effective_date"),
    category: text("category"),
    fileUrl: text("file_url").notNull(),
    extractedContent: text("extracted_content"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pcc_uploaded_files_patient_file_idx").on(
      table.patientId,
      table.pccFileId
    ),
  ]
);

export type PccUploadedFile = typeof pccUploadedFilesTable.$inferSelect;
