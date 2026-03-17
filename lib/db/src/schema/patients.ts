import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  facilityName: text("facility_name").notNull(),
  unit: text("unit").notNull(),
  mrn: text("mrn"),
  admissionDate: text("admission_date"),
  primaryDiagnosis: text("primary_diagnosis"),
  // PCC-sourced fields
  nickname: text("nickname"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  pccInternalId: text("pcc_internal_id"),
  admissionStatus: text("admission_status"),
  physician: text("physician"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
