import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreatePatientBody,
  UpdatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  DeletePatientParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  try {
    const patients = await db
      .select()
      .from(patientsTable)
      .orderBy(patientsTable.createdAt);
    res.json(
      patients.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreatePatientBody.parse(req.body);
    const [patient] = await db
      .insert(patientsTable)
      .values({
        name: body.name,
        age: body.age,
        facilityName: body.facilityName,
        unit: body.unit,
        mrn: body.mrn ?? null,
        admissionDate: body.admissionDate ?? null,
        primaryDiagnosis: body.primaryDiagnosis ?? null,
      })
      .returning();
    res.status(201).json({
      ...patient,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(400).json({ error: "validation_error", message: String(err) });
  }
});

router.get("/:patientId", async (req, res) => {
  try {
    const { patientId } = GetPatientParams.parse(req.params);
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId));
    if (!patient) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Patient not found" });
    }
    return res.json({
      ...patient,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "internal_error", message: String(err) });
  }
});

router.put("/:patientId", async (req, res) => {
  try {
    const { patientId } = UpdatePatientParams.parse(req.params);
    const body = UpdatePatientBody.parse(req.body);
    const [patient] = await db
      .update(patientsTable)
      .set({
        name: body.name,
        age: body.age,
        facilityName: body.facilityName,
        unit: body.unit,
        mrn: body.mrn ?? null,
        admissionDate: body.admissionDate ?? null,
        primaryDiagnosis: body.primaryDiagnosis ?? null,
        updatedAt: new Date(),
      })
      .where(eq(patientsTable.id, patientId))
      .returning();
    if (!patient) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Patient not found" });
    }
    return res.json({
      ...patient,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    });
  } catch (err) {
    return res
      .status(400)
      .json({ error: "validation_error", message: String(err) });
  }
});

router.delete("/:patientId", async (req, res) => {
  try {
    const { patientId } = DeletePatientParams.parse(req.params);
    await db.delete(patientsTable).where(eq(patientsTable.id, patientId));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

export default router;
