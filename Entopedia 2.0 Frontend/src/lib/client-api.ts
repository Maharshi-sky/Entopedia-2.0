export async function clientApi<T>(path: string, init?: RequestInit): Promise<T> {
  const cleanPath = path.replace(/^\/api\//, "").replace(/^\//, "");
  const proxyUrl = `/api/backend/${cleanPath}`;

  const res = await fetch(proxyUrl, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}