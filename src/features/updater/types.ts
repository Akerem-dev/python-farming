export type ApplicationUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

export interface AvailableApplicationUpdate {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string | null;
}

export interface UpdateDownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
}
