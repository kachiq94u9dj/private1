import type { DeviceInfo, PickupRow, UsageRow, UsageSource } from "../../src/shared/types.ts";

export interface SourceResult {
  source: UsageSource;
  rows: UsageRow[];
  devices: DeviceInfo[];
  pickups: PickupRow[];
  notes: string[];
}

export interface SourceContext {
  local: DeviceInfo;
  sinceMs: number;
  excludeDevices: string[];
}
