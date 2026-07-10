/**
 * MiroFish backend API client
 * @see https://github.com/666ghj/MiroFish
 */

const DEFAULT_BASE = "http://127.0.0.1:5001";

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, "")}${path}`;
}

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || body.message || `MiroFish HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (body.success === false) {
    const err = new Error(body.error || "MiroFish request failed");
    err.body = body;
    throw err;
  }
  return body.data ?? body;
}

class MiroFishClient {
  constructor(baseUrl = DEFAULT_BASE) {
    this.baseUrl = baseUrl;
  }

  async health() {
    const res = await fetch(joinUrl(this.baseUrl, "/health"));
    return res.json();
  }

  async generateOntology({ files, simulationRequirement, projectName, additionalContext }) {
    const form = new FormData();
    for (const file of files) {
      form.append("files", file.blob, file.name);
    }
    form.append("simulation_requirement", simulationRequirement);
    form.append("project_name", projectName || "Visionist Prediction");
    if (additionalContext) {
      form.append("additional_context", additionalContext);
    }

    const res = await fetch(joinUrl(this.baseUrl, "/api/graph/ontology/generate"), {
      method: "POST",
      body: form
    });
    return parseJson(res);
  }

  async buildGraph(projectId, graphName) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/graph/build"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, graph_name: graphName })
    });
    return parseJson(res);
  }

  async getTask(taskId) {
    const res = await fetch(joinUrl(this.baseUrl, `/api/graph/task/${taskId}`));
    return parseJson(res);
  }

  async getProject(projectId) {
    const res = await fetch(joinUrl(this.baseUrl, `/api/graph/project/${projectId}`));
    return parseJson(res);
  }

  async createSimulation(projectId, graphId) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, graph_id: graphId })
    });
    return parseJson(res);
  }

  async prepareSimulation(simulationId) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/prepare"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async getPrepareStatus({ taskId, simulationId }) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/prepare/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async startSimulation(simulationId, maxRounds) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simulationId,
        platform: "parallel",
        max_rounds: maxRounds,
        force: true
      })
    });
    return parseJson(res);
  }

  async getRunStatus(simulationId) {
    const res = await fetch(joinUrl(this.baseUrl, `/api/simulation/${simulationId}/run-status`));
    return parseJson(res);
  }

  async stopSimulation(simulationId) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/stop"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async closeSimulationEnv(simulationId) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/simulation/close-env"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async generateReport(simulationId) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/report/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async getReportGenerateStatus({ taskId, simulationId }) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/report/generate/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId })
    });
    return parseJson(res);
  }

  async getReport(reportId) {
    const res = await fetch(joinUrl(this.baseUrl, `/api/report/${reportId}`));
    return parseJson(res);
  }

  async chatWithReport({ simulationId, message, chatHistory = [] }) {
    const res = await fetch(joinUrl(this.baseUrl, "/api/report/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simulationId,
        message,
        chat_history: chatHistory
      })
    });
    return parseJson(res);
  }
}

async function waitForTask(client, taskId, { onProgress, timeoutMs = 600000, pollMs = 3000 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await client.getTask(taskId);
    if (onProgress) onProgress(task);
    const status = String(task.status || "").toLowerCase();
    if (status === "completed") return task;
    if (status === "failed") {
      throw new Error(task.error || task.message || "Task failed");
    }
    await sleep(pollMs);
  }
  throw new Error("Timed out waiting for MiroFish task");
}

async function waitForPrepare(client, { taskId, simulationId }, opts) {
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 900000;
  const pollMs = opts?.pollMs ?? 4000;

  while (Date.now() - start < timeoutMs) {
    const data = await client.getPrepareStatus({ taskId, simulationId });
    if (opts?.onProgress) opts.onProgress(data);
    const status = String(data.status || "").toLowerCase();
    if (status === "ready" || status === "completed" || data.already_prepared) return data;
    if (status === "failed") {
      throw new Error(data.error || data.message || "Simulation prepare failed");
    }
    await sleep(pollMs);
  }
  throw new Error("Timed out waiting for simulation prepare");
}

async function waitForSimulationRun(client, simulationId, { maxRounds, onProgress, timeoutMs = 1800000, pollMs = 5000 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await client.getRunStatus(simulationId);
    if (onProgress) onProgress(run);
    const status = String(run.runner_status || "").toLowerCase();
    const current = Number(run.current_round || 0);
    if (status === "completed" || status === "stopped" || status === "idle") {
      if (current > 0 || status === "completed") return run;
    }
    if (maxRounds > 0 && current >= maxRounds) {
      try { await client.stopSimulation(simulationId); } catch { /* ignore */ }
      return run;
    }
    await sleep(pollMs);
  }
  try { await client.stopSimulation(simulationId); } catch { /* ignore */ }
  throw new Error("Timed out waiting for simulation run");
}

async function waitForReport(client, { taskId, simulationId }, opts) {
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 900000;
  const pollMs = opts?.pollMs ?? 4000;

  while (Date.now() - start < timeoutMs) {
    const data = await client.getReportGenerateStatus({ taskId, simulationId });
    if (opts?.onProgress) opts.onProgress(data);
    const status = String(data.status || "").toLowerCase();
    if (status === "completed" || data.already_completed) return data;
    if (status === "failed") {
      throw new Error(data.error || data.message || "Report generation failed");
    }
    await sleep(pollMs);
  }
  throw new Error("Timed out waiting for report");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  MiroFishClient,
  waitForTask,
  waitForPrepare,
  waitForSimulationRun,
  waitForReport,
  sleep
};
