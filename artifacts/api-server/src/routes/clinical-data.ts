import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { patientClinicalDataTable, patientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

// GET /patients/:patientId/clinical-data
// Returns all scraped clinical data for a patient, keyed by data_type
router.get("/", async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) return res.status(400).json({ error: "Invalid patientId" });

  try {
    const rows = await db
      .select()
      .from(patientClinicalDataTable)
      .where(eq(patientClinicalDataTable.patientId, patientId));

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.dataType] = { data: row.data, scrapedAt: row.scrapedAt };
    }
    res.json(result);
  } catch (err) {
    console.error("[clinical-data] GET error:", err);
    res.status(500).json({ error: "Failed to fetch clinical data" });
  }
});

// POST /patients/:patientId/clinical-data
// Upserts clinical data for a specific data_type
// Body: { dataType: string, data: object }
router.post("/", async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) return res.status(400).json({ error: "Invalid patientId" });

  const { dataType, data } = req.body || {};
  if (!dataType || typeof dataType !== "string") {
    return res.status(400).json({ error: "dataType is required" });
  }

  try {
    // Verify patient exists
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);

    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const [upserted] = await db
      .insert(patientClinicalDataTable)
      .values({ patientId, dataType, data: data ?? null, scrapedAt: new Date() })
      .onConflictDoUpdate({
        target: [patientClinicalDataTable.patientId, patientClinicalDataTable.dataType],
        set: { data: data ?? null, scrapedAt: new Date() },
      })
      .returning();

    res.json({ success: true, row: upserted });
  } catch (err) {
    console.error("[clinical-data] POST error:", err);
    res.status(500).json({ error: "Failed to save clinical data" });
  }
});

export default router;
