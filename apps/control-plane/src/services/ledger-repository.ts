import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  LedgerCoachMemory,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  LifeStageRecord
} from "@agent-zy/shared-types";

const LEDGER_FILE_NAMES = {
  facts: "facts.json",
  semantics: "semantics.json",
  stages: "stages.json",
  reports: "reports.json",
  memories: "memories.json"
} as const;

export interface LedgerRepository {
  readFacts(): LedgerFactRecord[];
  writeFacts(records: LedgerFactRecord[]): void;
  readSemantics(): LedgerSemanticRecord[];
  writeSemantics(records: LedgerSemanticRecord[]): void;
  readStages(): LifeStageRecord[];
  writeStages(records: LifeStageRecord[]): void;
  readReports(): LedgerReportRecord[];
  writeReports(records: LedgerReportRecord[]): void;
  readMemories(): LedgerCoachMemory[];
  writeMemories(records: LedgerCoachMemory[]): void;
}

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function formatFileError(filePath: string, action: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to ${action} ledger file at ${filePath}: ${reason}`);
}

function ensureArrayFile(filePath: string) {
  try {
    readFileSync(filePath, "utf8");
  } catch (error) {
    if (!isEnoentError(error)) {
      throw error;
    }

    writeFileSync(filePath, JSON.stringify([], null, 2), "utf8");
  }
}

function readArrayFile<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, "utf8");

  try {
    return JSON.parse(raw) as T[];
  } catch (error) {
    throw formatFileError(filePath, "parse", error);
  }
}

function writeArrayFile<T>(filePath: string, records: T[]) {
  writeFileSync(filePath, JSON.stringify(records, null, 2), "utf8");
}

export function createLedgerRepository(dataDir: string): LedgerRepository {
  const ledgerDir = resolve(dataDir, "ledger");
  const factsPath = resolve(ledgerDir, LEDGER_FILE_NAMES.facts);
  const semanticsPath = resolve(ledgerDir, LEDGER_FILE_NAMES.semantics);
  const stagesPath = resolve(ledgerDir, LEDGER_FILE_NAMES.stages);
  const reportsPath = resolve(ledgerDir, LEDGER_FILE_NAMES.reports);
  const memoriesPath = resolve(ledgerDir, LEDGER_FILE_NAMES.memories);

  mkdirSync(ledgerDir, { recursive: true });
  ensureArrayFile(factsPath);
  ensureArrayFile(semanticsPath);
  ensureArrayFile(stagesPath);
  ensureArrayFile(reportsPath);
  ensureArrayFile(memoriesPath);

  return {
    readFacts() {
      return readArrayFile<LedgerFactRecord>(factsPath);
    },
    writeFacts(records) {
      writeArrayFile(factsPath, records);
    },
    readSemantics() {
      return readArrayFile<LedgerSemanticRecord>(semanticsPath);
    },
    writeSemantics(records) {
      writeArrayFile(semanticsPath, records);
    },
    readStages() {
      return readArrayFile<LifeStageRecord>(stagesPath);
    },
    writeStages(records) {
      writeArrayFile(stagesPath, records);
    },
    readReports() {
      return readArrayFile<LedgerReportRecord>(reportsPath);
    },
    writeReports(records) {
      writeArrayFile(reportsPath, records);
    },
    readMemories() {
      return readArrayFile<LedgerCoachMemory>(memoriesPath);
    },
    writeMemories(records) {
      writeArrayFile(memoriesPath, records);
    }
  };
}
