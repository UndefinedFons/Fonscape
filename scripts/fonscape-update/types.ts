import type { Buffer } from "node:buffer";

export interface ManifestOwnership {
  user: string[];
  seed: string[];
  history?: string[];
  merge: string[];
  theme: string[];
}

export interface UpdateManifest {
  schemaVersion: 1;
  version: string;
  ownership: ManifestOwnership;
}

export interface DeleteAction {
  path: string;
  operation: "delete";
  content: null;
  reason: string;
  mode: null;
  expectedLocalHash: string | null;
}

export interface WriteAction {
  path: string;
  operation: "write";
  content: Buffer;
  reason: string;
  mode: number;
  expectedLocalHash: string | null;
}

export type UpdateAction = DeleteAction | WriteAction;

export interface UpdateConflict {
  path: string;
  reason: string;
  base: Buffer | null;
  local: Buffer | null;
  incoming: Buffer | null;
  merged: Buffer | null;
}

export interface UpdatePlan {
  fromVersion: string;
  targetVersion: string;
  actions: UpdateAction[];
  conflicts: UpdateConflict[];
  warnings: string[];
  skippedUserFiles: string[];
}

export interface UpdateOptions {
  apply: boolean;
  project: string;
  reconcile_theme?: boolean;
  help?: boolean;
  from?: string;
  to?: string;
  repository?: string;
  source_dir?: string;
  target_dir?: string;
  resolutions?: string;
  rollback?: string;
  keep?: string[];
  take_incoming?: string[];
}

export type BackupEntry =
  | { path: string; present: true; mode: number }
  | { path: string; present: false; mode: null };

export interface BackupMetadata {
  schemaVersion: 1;
  fromVersion: string;
  targetVersion: string;
  previousVersion: string | null;
  entries: BackupEntry[];
}

export interface ConflictReference {
  path: string;
  reason: string;
}
