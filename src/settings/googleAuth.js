/**
 * Validates service account JSON shape without logging contents.
 * @returns {{ ok: true, projectId: string } | { ok: false }}
 */
export function parseServiceAccountJson(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false };
  }
  try {
    const data = JSON.parse(raw);
    if (data?.type !== "service_account") return { ok: false };
    if (!data.private_key || !data.client_email || !data.project_id) return { ok: false };
    return { ok: true, projectId: String(data.project_id) };
  } catch {
    return { ok: false };
  }
}

export function hasGoogleVertexCredentials(google) {
  if (!google || google.authMode !== "vertex") return false;
  const parsed = parseServiceAccountJson(google.serviceAccountJson);
  return parsed.ok;
}

export function hasGoogleApiKeyCredentials(google) {
  return Boolean(google?.apiKey?.trim());
}

export function hasGoogleCredentials(google) {
  if (!google) return false;
  if (google.authMode === "vertex") return hasGoogleVertexCredentials(google);
  return hasGoogleApiKeyCredentials(google);
}

/** Strip service account from persisted settings. */
export function googleSettingsForStorage(google) {
  if (!google) return google;
  const { serviceAccountJson, ...rest } = google;
  return { ...rest, serviceAccountJson: "" };
}
