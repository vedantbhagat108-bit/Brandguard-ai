import firebaseConfig from '../../firebase-applet-config.json';

export type ServerSliceId = 'security_db' | 'lobbies_db';

export interface ServerStateEnvelope<T> {
  version: number;
  updatedAt: string;
  data: T;
}

const SYNC_TOKEN = 'bg_srv_sync_v1_9f8a7b6c';

function getFirestoreDocUrl(sliceId: ServerSliceId): string {
  const projectId = firebaseConfig.projectId;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const apiKey = firebaseConfig.apiKey;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(
    dbId
  )}/documents/server_sync/${encodeURIComponent(sliceId)}?key=${encodeURIComponent(
    apiKey
  )}`;
}

export async function readFirestoreSlice<T>(
  sliceId: ServerSliceId
): Promise<ServerStateEnvelope<T> | null> {
  try {
    const url = getFirestoreDocUrl(sliceId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      return null;
    }

    const doc = await res.json();
    const fields = doc?.fields;
    if (!fields) return null;

    const version = Number(fields.version?.integerValue || 1);
    const updatedAt = String(fields.updatedAt?.stringValue || '');
    const payloadJson = String(fields.payloadJson?.stringValue || '');
    if (!payloadJson) return null;

    const data = JSON.parse(payloadJson) as T;
    return {
      version: Number.isFinite(version) && version >= 1 ? version : 1,
      updatedAt: updatedAt || new Date(0).toISOString(),
      data,
    };
  } catch {
    return null;
  }
}

export async function writeFirestoreSlice<T>(
  sliceId: ServerSliceId,
  version: number,
  updatedAt: string,
  data: T
): Promise<boolean> {
  try {
    const url = getFirestoreDocUrl(sliceId);
    const safeVersion = Math.max(1, Math.floor(version));
    const payloadJson = JSON.stringify(data);
    if (payloadJson.length > 890000) {
      return false;
    }

    const body = {
      fields: {
        sliceId: { stringValue: sliceId },
        syncToken: { stringValue: SYNC_TOKEN },
        version: { integerValue: String(safeVersion) },
        updatedAt: { stringValue: updatedAt },
        payloadJson: { stringValue: payloadJson },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);

    return res.ok;
  } catch {
    return false;
  }
}
