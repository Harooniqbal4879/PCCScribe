import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pccUploadedFilesTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

function serializeFile(f: typeof pccUploadedFilesTable.$inferSelect) {
  return {
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// GET /patients/:patientId/files
router.get("/", async (req, res) => {
  const patientId = parseInt(req.params.patientId);
  if (isNaN(patientId)) {
    return res.status(400).json({ error: "invalid_patient_id" });
  }

  try {
    const files = await db
      .select()
      .from(pccUploadedFilesTable)
      .where(eq(pccUploadedFilesTable.patientId, patientId))
      .orderBy(pccUploadedFilesTable.effectiveDate);

    return res.json(files.map(serializeFile));
  } catch (err) {
    return res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

// POST /patients/:patientId/files — bulk upsert by pccFileId
router.post("/", async (req, res) => {
  const patientId = parseInt(req.params.patientId);
  if (isNaN(patientId)) {
    return res.status(400).json({ error: "invalid_patient_id" });
  }

  const { files } = req.body as {
    files: Array<{
      fileId: string;
      clientId: string;
      storedName: string;
      displayName: string;
      effectiveDate?: string;
      category?: string;
      url: string;
    }>;
  };

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files_required" });
  }

  // Verify patient exists
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId));

  if (!patient) {
    return res.status(404).json({ error: "patient_not_found" });
  }

  try {
    const saved = [];
    for (const f of files) {
      const [row] = await db
        .insert(pccUploadedFilesTable)
        .values({
          patientId,
          pccFileId: String(f.fileId),
          pccClientId: String(f.clientId),
          storedName: f.storedName,
          displayName: f.displayName,
          effectiveDate: f.effectiveDate || null,
          category: f.category || null,
          fileUrl: f.url,
        })
        .onConflictDoUpdate({
          target: [
            pccUploadedFilesTable.patientId,
            pccUploadedFilesTable.pccFileId,
          ],
          set: {
            displayName: f.displayName,
            effectiveDate: f.effectiveDate || null,
            category: f.category || null,
            fileUrl: f.url,
            updatedAt: new Date(),
          },
        })
        .returning();
      saved.push(row);
    }

    return res.status(201).json({ saved: saved.length, files: saved.map(serializeFile) });
  } catch (err) {
    return res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

export default router;
