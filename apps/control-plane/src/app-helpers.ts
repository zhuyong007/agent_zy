function parseMultipartBoundary(contentType: unknown) {
  const header = Array.isArray(contentType) ? contentType[0] : contentType;
  const match = typeof header === "string" ? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(header) : null;

  return match?.[1] ?? match?.[2]?.trim() ?? null;
}

function decodeMultipartHeaderValue(value: string) {
  if ([...value].some((char) => char.charCodeAt(0) > 255)) {
    return value;
  }

  const decoded = Buffer.from(value, "binary").toString("utf8");

  return decoded.includes("\uFFFD") ? value : decoded;
}

function decodeQuotedMultipartValue(value: string | undefined, fallback: string) {
  return value ? decodeMultipartHeaderValue(value) : fallback;
}

function parseMultipartFilename(disposition: string, fallback: string) {
  const encodedFilename = /filename\*=(?:(?:UTF-8'')?([^;\r\n]+))/i.exec(disposition)?.[1];

  if (encodedFilename) {
    const unquoted = encodedFilename.replace(/^"|"$/g, "");

    try {
      return decodeURIComponent(unquoted);
    } catch {
      return decodeMultipartHeaderValue(unquoted);
    }
  }

  return decodeQuotedMultipartValue(/filename="([^"]*)"/i.exec(disposition)?.[1], fallback);
}

export function parseFallbackMultipartUpload(contentType: unknown, body: unknown) {
  const boundary = parseMultipartBoundary(contentType);

  if (!boundary || !Buffer.isBuffer(body)) {
    throw new Error("video upload support is not installed; run npm install to restore @fastify/multipart");
  }

  const fields: Record<string, string> = {};
  let video:
    | {
        filename: string;
        mimetype: string;
        buffer: Buffer;
      }
    | null = null;
  const raw = body.toString("binary");
  const marker = `--${boundary}`;

  for (const segment of raw.split(marker)) {
    const trimmed = segment.replace(/^\r\n/, "");

    if (!trimmed || trimmed.startsWith("--")) {
      continue;
    }

    const headerEnd = trimmed.indexOf("\r\n\r\n");

    if (headerEnd < 0) {
      continue;
    }

    const headerText = trimmed.slice(0, headerEnd);
    const contentText = trimmed.slice(headerEnd + 4).replace(/\r\n$/, "");
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] ?? "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];

    if (!name) {
      continue;
    }

    if (filename !== undefined) {
      video = {
        filename: decodeQuotedMultipartValue(filename, "uploaded-video"),
        mimetype: /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "",
        buffer: Buffer.from(contentText, "binary")
      };
      continue;
    }

    fields[name] = contentText;
  }

  if (!video) {
    throw new Error("请上传 video 文件");
  }

  return {
    fields,
    video
  };
}

export function parseFallbackMultipartImage(contentType: unknown, body: unknown) {
  const boundary = parseMultipartBoundary(contentType);

  if (!boundary || !Buffer.isBuffer(body)) {
    throw new Error("图片上传格式无效");
  }

  const fields: Record<string, string> = {};
  let image: { filename: string; mimetype: string; buffer: Buffer } | null = null;
  const raw = body.toString("binary");

  for (const segment of raw.split(`--${boundary}`)) {
    const trimmed = segment.replace(/^\r\n/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (!trimmed || trimmed.startsWith("--") || headerEnd < 0) {
      continue;
    }
    const headerText = trimmed.slice(0, headerEnd);
    const contentText = trimmed.slice(headerEnd + 4).replace(/\r\n$/, "");
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] ?? "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    if (!name) {
      continue;
    }
    if (filename !== undefined && name === "image") {
      image = {
        filename: decodeQuotedMultipartValue(filename, "uploaded-image"),
        mimetype: /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "",
        buffer: Buffer.from(contentText, "binary")
      };
    } else if (filename === undefined) {
      fields[name] = contentText;
    }
  }

  if (!image) {
    throw new Error("请上传 image 文件");
  }
  return { fields, image };
}

export function parseFallbackMultipartFile(contentType: unknown, body: unknown, fieldName: string) {
  const boundary = parseMultipartBoundary(contentType);

  if (!boundary || !Buffer.isBuffer(body)) {
    throw new Error("上传文件格式无效");
  }

  let file: { filename: string; mimetype: string; buffer: Buffer } | null = null;
  const raw = body.toString("binary");

  for (const segment of raw.split(`--${boundary}`)) {
    const trimmed = segment.replace(/^\r\n/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (!trimmed || trimmed.startsWith("--") || headerEnd < 0) {
      continue;
    }

    const headerText = trimmed.slice(0, headerEnd);
    const contentText = trimmed.slice(headerEnd + 4).replace(/\r\n$/, "");
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] ?? "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];

    if (name === fieldName && filename !== undefined) {
      file = {
        filename: parseMultipartFilename(disposition, "uploaded-file"),
        mimetype: /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "",
        buffer: Buffer.from(contentText, "binary")
      };
      break;
    }
  }

  if (!file) {
    throw new Error(`请上传 ${fieldName} 文件`);
  }

  return file;
}

export function isLocalBrowserRequest(origin: unknown) {
  if (typeof origin !== "string" || !origin.trim()) {
    return true;
  }

  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function assertLocalBrowserRequest(headers: Record<string, unknown>, message: string) {
  if (!isLocalBrowserRequest(headers.origin)) {
    throw new Error(message);
  }
}
