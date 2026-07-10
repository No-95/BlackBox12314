const crypto = require("crypto");
const {
  MiroFishClient,
  waitForTask,
  waitForPrepare,
  waitForSimulationRun,
  waitForReport
} = require("./lib/mirofish-client");

function registerVisionistRoutes(app, options = {}) {
  const mirofishBaseUrl = options.baseUrl || process.env.MIROFISH_BASE_URL || "http://127.0.0.1:5001";
  const defaultMaxRounds = Number(options.maxRounds || process.env.VISIONIST_MAX_ROUNDS || 24);
  const client = new MiroFishClient(mirofishBaseUrl);
  const sessions = new Map();

  function newSessionId() {
    return `vis_${crypto.randomBytes(8).toString("hex")}`;
  }

  function publicSession(session) {
    return {
      id: session.id,
      status: session.status,
      stage: session.stage,
      progress: session.progress,
      message: session.message,
      projectId: session.projectId,
      simulationId: session.simulationId,
      reportId: session.reportId,
      reportMarkdown: session.reportMarkdown,
      analysisSummary: session.analysisSummary,
      error: session.error,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  function updateSession(session, patch) {
    Object.assign(session, patch, { updatedAt: Date.now() });
  }

  async function runPrediction(session, payload) {
    const {
      projectName,
      simulationRequirement,
      additionalContext,
      files,
      maxRounds = defaultMaxRounds
    } = payload;

    try {
      updateSession(session, {
        status: "running",
        stage: "ontology",
        progress: 5,
        message: "Đang phân tích tài liệu và tạo ontology..."
      });

      const ontologyResult = await client.generateOntology({
        files,
        simulationRequirement,
        projectName,
        additionalContext
      });

      session.projectId = ontologyResult.project_id;
      session.analysisSummary = ontologyResult.analysis_summary || "";

      updateSession(session, {
        stage: "graph",
        progress: 15,
        message: "Đang xây dựng knowledge graph (Zep)..."
      });

      const buildResult = await client.buildGraph(session.projectId, projectName);
      const graphTask = await waitForTask(client, buildResult.task_id, {
        onProgress: (task) => {
          updateSession(session, {
            progress: 15 + Math.round((Number(task.progress) || 0) * 0.25),
            message: task.message || "Đang xây dựng graph..."
          });
        }
      });

      const graphId = graphTask.result?.graph_id;
      if (!graphId) {
        const project = await client.getProject(session.projectId);
        session.graphId = project.graph_id;
      } else {
        session.graphId = graphId;
      }

      updateSession(session, {
        stage: "simulation",
        progress: 42,
        message: "Đang tạo môi trường mô phỏng đa tác nhân..."
      });

      const sim = await client.createSimulation(session.projectId, session.graphId);
      session.simulationId = sim.simulation_id;

      updateSession(session, {
        stage: "prepare",
        progress: 48,
        message: "Đang sinh persona agent và cấu hình mô phỏng..."
      });

      const prepare = await client.prepareSimulation(session.simulationId);
      if (!prepare.already_prepared) {
        await waitForPrepare(client, {
          taskId: prepare.task_id,
          simulationId: session.simulationId
        }, {
          onProgress: (data) => {
            updateSession(session, {
              progress: 48 + Math.round((Number(data.progress) || 0) * 0.22),
              message: data.message || "Đang chuẩn bị agent..."
            });
          }
        });
      }

      updateSession(session, {
        stage: "running_sim",
        progress: 72,
        message: `Đang chạy mô phỏng (${maxRounds} vòng)...`
      });

      await client.startSimulation(session.simulationId, maxRounds);
      await waitForSimulationRun(client, session.simulationId, {
        maxRounds,
        onProgress: (run) => {
          const pct = Number(run.progress_percent) || 0;
          updateSession(session, {
            progress: 72 + Math.round(pct * 0.18),
            message: `Mô phỏng: vòng ${run.current_round || 0}/${run.total_rounds || maxRounds}`
          });
        }
      });

      try {
        await client.closeSimulationEnv(session.simulationId);
      } catch {
        // optional
      }

      updateSession(session, {
        stage: "report",
        progress: 92,
        message: "Đang tạo báo cáo dự đoán..."
      });

      const reportStart = await client.generateReport(session.simulationId);
      if (reportStart.already_generated && reportStart.report_id) {
        session.reportId = reportStart.report_id;
      } else {
        const reportTask = await waitForReport(client, {
          taskId: reportStart.task_id,
          simulationId: session.simulationId
        }, {
          onProgress: (data) => {
            updateSession(session, {
              progress: 92 + Math.round((Number(data.progress) || 0) * 0.08),
              message: data.message || "Đang viết báo cáo..."
            });
          }
        });
        session.reportId = reportTask.report_id || reportTask.result?.report_id || reportStart.report_id;
      }

      const report = await client.getReport(session.reportId);
      session.reportMarkdown = report.markdown_content || "";

      updateSession(session, {
        status: "completed",
        stage: "done",
        progress: 100,
        message: "Dự đoán hoàn tất.",
        error: null
      });
    } catch (error) {
      updateSession(session, {
        status: "failed",
        stage: "error",
        message: error.message || "Prediction failed",
        error: error.message || String(error)
      });
    }
  }

  app.get("/api/visionist/health", async (_req, res) => {
    try {
      const miro = await client.health();
      res.json({ ok: true, mirofish: miro, baseUrl: mirofishBaseUrl });
    } catch (error) {
      res.status(503).json({
        ok: false,
        mirofish: null,
        baseUrl: mirofishBaseUrl,
        error: error.message
      });
    }
  });

  app.get("/api/visionist/sessions", (_req, res) => {
    const list = [...sessions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map(publicSession);
    res.json(list);
  });

  app.get("/api/visionist/sessions/:id", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(publicSession(session));
  });

  app.post("/api/visionist/predict", (req, res) => {
    const {
      projectName = "Visionist Prediction",
      simulationRequirement,
      contextText = "",
      additionalContext = "",
      maxRounds = defaultMaxRounds,
      files: uploadedFiles = []
    } = req.body || {};

    if (!simulationRequirement || !String(simulationRequirement).trim()) {
      return res.status(400).json({ error: "simulationRequirement is required" });
    }

    const files = [];
    const mergedContext = [contextText, additionalContext].filter(Boolean).join("\n\n");
    if (mergedContext.trim()) {
      files.push({
        name: "context.txt",
        blob: new Blob([mergedContext], { type: "text/plain" })
      });
    }

    for (const item of uploadedFiles) {
      if (!item?.name || !item?.content) continue;
      files.push({
        name: String(item.name),
        blob: new Blob([String(item.content)], { type: "text/plain" })
      });
    }

    if (!files.length) {
      return res.status(400).json({
        error: "Provide contextText or at least one text file for MiroFish seed material."
      });
    }

    const session = {
      id: newSessionId(),
      status: "queued",
      stage: "queued",
      progress: 0,
      message: "Đã xếp hàng...",
      projectId: null,
      graphId: null,
      simulationId: null,
      reportId: null,
      reportMarkdown: null,
      analysisSummary: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    sessions.set(session.id, session);

    res.json({ session: publicSession(session) });

    runPrediction(session, {
      projectName,
      simulationRequirement,
      additionalContext: additionalContext || undefined,
      files,
      maxRounds: Number(maxRounds) || defaultMaxRounds
    });
  });

  app.post("/api/visionist/sessions/:id/chat", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.simulationId) {
      return res.status(404).json({ error: "Session or simulation not ready" });
    }

    const message = req.body?.message;
    const chatHistory = req.body?.chatHistory || [];
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    try {
      const data = await client.chatWithReport({
        simulationId: session.simulationId,
        message,
        chatHistory
      });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerVisionistRoutes };
