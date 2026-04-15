import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import patientsRouter from "./patients.js";
import notesRouter from "./notes.js";
import summariesRouter from "./summaries.js";
import chatRouter from "./chat.js";
import filesRouter from "./files.js";
import clinicalDataRouter from "./clinical-data.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/patients", patientsRouter);
router.use("/patients/:patientId/notes", notesRouter);
router.use("/patients/:patientId/summaries", summariesRouter);
router.use("/patients/:patientId/chat", chatRouter);
router.use("/patients/:patientId/files", filesRouter);
router.use("/patients/:patientId/clinical-data", clinicalDataRouter);

export default router;
