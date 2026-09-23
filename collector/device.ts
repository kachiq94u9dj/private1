import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { DeviceInfo } from "../src/shared/types.ts";

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function computerName(): string {
  return run("scutil", ["--get", "ComputerName"]) || run("hostname", []) || "Mac";
}

/** この Mac の識別子（ハードウェア UUID）と名前 */
export function localDevice(): DeviceInfo {
  const ioreg = run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
  const uuid = /"IOPlatformUUID" = "([^"]+)"/.exec(ioreg)?.[1] ?? computerName();
  return { id: `mac:${uuid}`, name: computerName(), platform: "mac" };
}

const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.\-_]*$/;

/** bundle id からアプリ名を Spotlight で調べる（見つからなければ null） */
export function appNameFor(bundleId: string): string | null {
  if (!BUNDLE_ID.test(bundleId)) return null;
  const found = run("mdfind", [`kMDItemCFBundleIdentifier == '${bundleId}'`]).split("\n").find((p) => p.endsWith(".app"));
  return found ? basename(found, ".app") : null;
}
