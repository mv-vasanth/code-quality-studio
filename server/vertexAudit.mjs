const MAX_BODY = 2 * 1024 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function validateServiceAccount(sa) {
  if (!sa || sa.type !== "service_account") return false;
  if (!sa.private_key || !sa.client_email || !sa.project_id) return false;
  return true;
}

export async function runVertexAudit(body) {
  const { projectId, location, model, systemPrompt, userContent, serviceAccount } = body ?? {};
  if (!validateServiceAccount(serviceAccount)) {
    throw new Error("Invalid service account payload");
  }
  if (!projectId || !location || !model) {
    throw new Error("projectId, location, and model are required");
  }
  if (!systemPrompt || !userContent) {
    throw new Error("Missing prompt content");
  }

  const { VertexAI } = await import("@google-cloud/vertexai");
  const vertex = new VertexAI({
    project: projectId,
    location,
    googleAuthOptions: { credentials: serviceAccount },
  });

  const generativeModel = vertex.getGenerativeModel({
    model,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  });

  const result = await generativeModel.generateContent({
    contents: [{ role: "user", parts: [{ text: userContent }] }],
  });

  const text =
    result?.response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return { text };
}

export function createVertexAuditMiddleware() {
  return async (req, res, next) => {
    if (req.url !== "/api/vertex/audit" || req.method !== "POST") {
      next();
      return;
    }

    res.setHeader("Content-Type", "application/json");
    try {
      const body = await readJsonBody(req);
      const out = await runVertexAudit(body);
      res.statusCode = 200;
      res.end(JSON.stringify(out));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Vertex audit failed";
      res.statusCode = 500;
      res.end(JSON.stringify({ error: message }));
    }
  };
}
