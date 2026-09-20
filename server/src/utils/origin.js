function normalizeHost(hostname) {
  if (!hostname) return "";
  const value = hostname.replace(/[\[\]]/g, "");
  if (value === "127.0.0.1" || value === "::1") return "localhost";
  return value;
}

export function isAllowedOrigin(origin, allowedOrigins = []) {
  if (!origin) return true;

  let requestUrl;
  try {
    requestUrl = new URL(origin);
  } catch {
    return false;
  }

  const allowed = allowedOrigins
    .map((item) => {
      try {
        return new URL(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (allowed.some((item) => item.origin === requestUrl.origin)) return true;

  return allowed.some((item) => {
    return (
      normalizeHost(item.hostname) === normalizeHost(requestUrl.hostname) &&
      item.port === requestUrl.port
    );
  });
}
