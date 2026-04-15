import { pgTable, serial, integer, varchar, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const patientClinicalDataTable = pgTable("patient_clinical_data", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  dataType: varchar("data_type", { length: 50 }).notNull(),
  data: jsonb("data"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
}, (t) => [
  unique("patient_clinical_data_patient_id_data_type_key").on(t.patientId, t.dataType),
]);

export type PatientClinicalData = typeof patientClinicalDataTable.$inferSelect;
