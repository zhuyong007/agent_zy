import { describe, expect, it } from "vitest";

import {
  assertLocalBrowserRequest,
  parseFallbackMultipartImage,
  parseFallbackMultipartUpload
} from "./app-helpers";

function createMultipartPayload(input: {
  boundary: string;
  fileField: string;
  filename: string;
  mimeType: string;
  fields?: Record<string, string>;
}) {
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(input.fields ?? {})) {
    chunks.push(Buffer.from(`--${input.boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  chunks.push(Buffer.from(`--${input.boundary}\r\n`));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="${input.fileField}"; filename="${input.filename}"\r\nContent-Type: ${input.mimeType}\r\n\r\n`
    )
  );
  chunks.push(Buffer.from("fake-bytes"));
  chunks.push(Buffer.from(`\r\n--${input.boundary}--\r\n`));

  return Buffer.concat(chunks);
}

describe("app helpers", () => {
  it("parses fallback multipart video uploads", () => {
    const payload = createMultipartPayload({
      boundary: "agentzy",
      fileField: "video",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      fields: { revisionInstruction: "rainy-night" }
    });

    const result = parseFallbackMultipartUpload("multipart/form-data; boundary=agentzy", payload);

    expect(result.fields).toEqual({ revisionInstruction: "rainy-night" });
    expect(result.video.filename).toBe("clip.mp4");
    expect(result.video.mimetype).toBe("video/mp4");
    expect(result.video.buffer.toString()).toBe("fake-bytes");
  });

  it("parses fallback multipart image uploads", () => {
    const payload = createMultipartPayload({
      boundary: "agentzy-image",
      fileField: "image",
      filename: "cover.png",
      mimeType: "image/png",
      fields: { prompt: "first-frame" }
    });

    const result = parseFallbackMultipartImage("multipart/form-data; boundary=\"agentzy-image\"", payload);

    expect(result.fields).toEqual({ prompt: "first-frame" });
    expect(result.image.filename).toBe("cover.png");
    expect(result.image.mimetype).toBe("image/png");
    expect(result.image.buffer.toString()).toBe("fake-bytes");
  });

  it("rejects non-local browser requests", () => {
    expect(() => assertLocalBrowserRequest({ origin: "https://evil.example" }, "仅允许本机浏览器使用")).toThrow(
      "仅允许本机浏览器使用"
    );
    expect(() => assertLocalBrowserRequest({ origin: "http://127.0.0.1:5173" }, "仅允许本机浏览器使用")).not.toThrow();
  });
});
