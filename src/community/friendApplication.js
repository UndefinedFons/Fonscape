const FRIEND_APPLICATION_MARKER = "【友链申请】";
const FRIEND_APPLICATION_FIELDS = ["site", "url", "desc", "color"];

function parseFieldValue(rawValue) {
  const value = rawValue.trim();
  if (!value.startsWith('"')) return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

function validateApplication(fields) {
  const errors = [];
  if (!fields.site || fields.site.length > 80) errors.push("站点名称需为 1–80 个字符");
  if (!fields.desc || fields.desc.length > 160) errors.push("站点简介需为 1–160 个字符");
  if (!/^#[0-9a-f]{6}$/iu.test(fields.color || "")) errors.push("主题色需使用六位十六进制颜色");
  try {
    const url = new URL(fields.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid URL");
  } catch {
    errors.push("站点地址需为有效的 HTTP 或 HTTPS 地址");
  }
  return errors;
}

export function parseFriendApplication(body) {
  const lines = String(body || "").replaceAll("\r\n", "\n").split("\n");
  const markerIndex = lines.findIndex((line) => line.trim() === FRIEND_APPLICATION_MARKER);
  if (markerIndex < 0) return null;

  const fields = {};
  const duplicates = new Set();
  for (const line of lines.slice(markerIndex + 1)) {
    const match = line.match(/^\s*(site|url|desc|color)\s*:\s*(.*?)\s*$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (Object.hasOwn(fields, key)) duplicates.add(key);
    else fields[key] = parseFieldValue(rawValue).trim();
  }

  const missing = FRIEND_APPLICATION_FIELDS.filter((field) => !Object.hasOwn(fields, field));
  const errors = [
    ...missing.map((field) => `缺少 ${field} 字段`),
    ...[...duplicates].map((field) => `${field} 字段不能重复`),
    ...validateApplication(fields),
  ];
  return {
    valid: errors.length === 0,
    errors,
    data: {
      site: fields.site || "",
      url: fields.url || "",
      desc: fields.desc || "",
      color: String(fields.color || "").toLowerCase(),
    },
  };
}

export function friendEntryFromApplication(application, author) {
  if (!application?.valid) throw new TypeError("A valid friend application is required.");
  return {
    name: application.data.site,
    url: application.data.url,
    description: application.data.desc,
    owner: String(author?.nickname || "").trim(),
    userId: String(author?.id || "").trim(),
    color: application.data.color,
  };
}

export function friendEntryJson(application, author) {
  return JSON.stringify(friendEntryFromApplication(application, author), null, 2);
}

export { FRIEND_APPLICATION_MARKER };
