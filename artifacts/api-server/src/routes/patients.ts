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

// ── Helper: build a full field map from a validated body ─────────────────────
function buildPatientFields(body: ReturnType<typeof CreatePatientBody.parse>) {
  return {
    name: body.name,
    age: body.age,
    facilityName: body.facilityName,
    unit: body.unit,
    mrn: body.mrn ?? null,
    admissionDate: body.admissionDate ?? null,
    primaryDiagnosis: body.primaryDiagnosis ?? null,
    nickname: body.nickname ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    gender: body.gender ?? null,
    pccInternalId: body.pccInternalId ?? null,
    admissionStatus: body.admissionStatus ?? null,
    physician: body.physician ?? null,
    allergies: body.allergies ?? null,
    codeStatus: body.codeStatus ?? null,
    specialInstructions: body.specialInstructions ?? null,
    diet: body.diet ?? null,
    initialAdmissionDate: body.initialAdmissionDate ?? null,
    enterpriseId: body.enterpriseId ?? null,
    currentVitals: body.currentVitals ?? null,
    emergencyContact: body.emergencyContact ?? null,
  };
}

function serializePatient(p: typeof patientsTable.$inferSelect) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

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
      .values(buildPatientFields(body))
      .returning();
    res.status(201).json(serializePatient(patient));
  } catch (err) {
    res.status(400).json({ error: "validation_error", message: String(err) });
  }
});

// ── POST /patients/sync — upsert by pccInternalId ────────────────────────────
// IMPORTANT: must be registered BEFORE /:patientId to avoid route collision.
// Uses a single atomic INSERT … ON CONFLICT DO UPDATE so concurrent syncs
// from multiple browser tabs can never produce duplicate rows.
router.post("/sync", async (req, res) => {
  try {
    const body = CreatePatientBody.parse(req.body);

    if (!body.pccInternalId) {
      return res.status(400).json({
        error: "validation_error",
        message: "pccInternalId is required for sync",
      });
    }

    const fields = buildPatientFields(body);

    // Determine whether this will be an insert or an update so we can return
    // the correct HTTP status code (201 vs 200).
    const [existing] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.pccInternalId, body.pccInternalId));

    const [patient] = await db
      .insert(patientsTable)
      .values(fields)
      .onConflictDoUpdate({
        target: patientsTable.pccInternalId,
        set: { ...fields, updatedAt: new Date() },
      })
      .returning();

    const created = !existing;
    return res
      .status(created ? 201 : 200)
      .json({ patient: serializePatient(patient), created });
  } catch (err) {
    return res.status(400).json({ error: "validation_error", message: String(err) });
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
      .set({ ...buildPatientFields(body), updatedAt: new Date() })
      .where(eq(patientsTable.id, patientId))
      .returning();
    if (!patient) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Patient not found" });
    }
    return res.json(serializePatient(patient));
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
