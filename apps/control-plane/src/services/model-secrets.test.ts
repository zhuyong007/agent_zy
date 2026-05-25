import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createModelSecretsRepository, maskApiKey } from "./model-secrets";

describe("model secrets repository", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    for (const dataDir of dataDirs.splice(0)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function createTempDataDir() {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-secrets-test-"));
    dataDirs.push(dataDir);
    return dataDir;
  }

  it("masks keys without exposing the full value", () => {
    expect(maskApiKey("sk-test-secret-abcd")).toBe("sk-****abcd");
    expect(maskApiKey("short")).toBe("****hort");
  });

  it("prefers profile-local secrets over provider environment variables", () => {
    const repository = createModelSecretsRepository(createTempDataDir());

    repository.save("profile-openai", "local-secret");
    process.env.OPENAI_API_KEY = "env-secret-1234";

    expect(repository.resolve({ profileId: "profile-openai", provider: "openai" })).toMatchObject({
      value: "local-secret",
      source: "local",
      maskedKey: "local-****cret"
    });
  });

  it("writes local secrets under a separate secrets file and deletes by profile", () => {
    const dataDir = createTempDataDir();
    const repository = createModelSecretsRepository(dataDir);

    repository.save("profile-a", "sk-local-secret-abcd");

    const secretsPath = join(dataDir, "secrets", "model-secrets.json");
    expect(existsSync(secretsPath)).toBe(true);
    expect(readFileSync(secretsPath, "utf8")).toContain("sk-local-secret-abcd");
    expect(repository.getStatus({ profileId: "profile-a", provider: "openai" })).toMatchObject({
      hasApiKey: true,
      maskedKey: "sk-****abcd",
      apiKeySource: "local"
    });

    repository.delete("profile-a");

    expect(repository.getStatus({ profileId: "profile-a", provider: "openai" })).toEqual({
      hasApiKey: false,
      maskedKey: null,
      apiKeySource: null
    });
  });
});
