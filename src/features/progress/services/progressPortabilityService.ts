import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "../../../runtime/runtimeClient";
import type {
  ProgressExportResult,
  ProgressMutationResult,
} from "../portabilityTypes";

export const progressTransferPolicy = {
  maxPayloadBytes: 2 * 1024 * 1024,
  resetConfirmation: "İLERLEMEMİ SIFIRLA",
} as const;

function requireDesktopPortability() {
  if (!isTauriEnvironment()) {
    throw new Error(
      "İlerleme taşıma ve sıfırlama işlemleri yalnız Tauri masaüstü uygulamasında kullanılabilir.",
    );
  }
}

export async function exportProgressData(): Promise<ProgressExportResult> {
  requireDesktopPortability();
  return invoke<ProgressExportResult>("export_progress_data");
}

export async function importProgressData(payload: string): Promise<ProgressMutationResult> {
  requireDesktopPortability();
  return invoke<ProgressMutationResult>("import_progress_data", { payload });
}

export async function resetProgressData(
  confirmation: string,
): Promise<ProgressMutationResult> {
  requireDesktopPortability();
  return invoke<ProgressMutationResult>("reset_progress_data", { confirmation });
}
