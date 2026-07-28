import { parseAuditJsonFromModel } from "./parseAuditJson.js";
import { sanitizeClientError } from "./safeErrors.js";

async function loadBedrockSdk() {
  try {
    return await import("@aws-sdk/client-bedrock-runtime");
  } catch {
    throw new Error(
      "AWS Bedrock SDK is not installed. Run: npm install @aws-sdk/client-bedrock-runtime",
    );
  }
}

export async function invokeBedrock({ settings, systemPrompt, userContent }) {
  if (!settings?.useAi) throw new Error("AI review is disabled.");
  const { BedrockRuntimeClient, InvokeModelCommand } = await loadBedrockSdk();

  const { accessKeyId, secretAccessKey, region, modelId } = settings.bedrock;
  const client = new BedrockRuntimeClient({
    region: region || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
  });
  const model = modelId || "anthropic.claude-3-5-sonnet-20240620-v1:0";
  const isAnthropicClaudeOnBedrock = model.includes("anthropic.");
  let body;
  if (isAnthropicClaudeOnBedrock) {
    body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
  } else {
    body = JSON.stringify({
      inputText: `${systemPrompt}\n\n${userContent}`,
      textGenerationConfig: { maxTokenCount: 4096, temperature: 0.2 },
    });
  }
  const command = new InvokeModelCommand({
    modelId: model,
    contentType: "application/json",
    accept: "application/json",
    body,
  });
  try {
    const response = await client.send(command);
    const decoded = new TextDecoder().decode(response.body);
    if (isAnthropicClaudeOnBedrock) {
      const json = JSON.parse(decoded);
      const text = json.content?.map((c) => c.text).join("") ?? json.completion ?? decoded;
      return parseAuditJsonFromModel(text);
    }
    const json = JSON.parse(decoded);
    const text = json.results?.[0]?.outputText ?? json.generation ?? decoded;
    return parseAuditJsonFromModel(text);
  } catch (e) {
    throw new Error(sanitizeClientError(e?.message || "Bedrock request failed"));
  }
}
