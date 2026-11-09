// ブラウザで選ばれた ZIP・フォルダから、解析に必要な HTML だけを読み出す。
// 写真や動画など関係のないファイルは開かない（エクスポートは数 GB になることがある）。
import JSZip from "jszip";
import { isRelevantPath, type ExportFile } from "./parse";

function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip";
}

async function fromZip(file: File): Promise<ExportFile[]> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir && isRelevantPath(f.name));
  return Promise.all(entries.map(async (f) => ({ path: f.name, html: await f.async("string") })));
}

/** <input type="file"> で選ばれたファイル（ZIP、またはフォルダ選択の中身）。 */
export async function collectFromFiles(files: File[]): Promise<ExportFile[]> {
  const out: ExportFile[] = [];
  for (const file of files) {
    if (isZip(file)) {
      out.push(...(await fromZip(file)));
      continue;
    }
    const path = file.webkitRelativePath || file.name;
    if (isRelevantPath(path)) out.push({ path, html: await file.text() });
  }
  return out;
}

function readEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  // readEntries は一度に最大100件ほどしか返さないので、空になるまで繰り返す
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: ExportFile[], zips: File[]): Promise<void> {
  if (entry.isDirectory) {
    for (const child of await readEntries(entry as FileSystemDirectoryEntry)) await walk(child, out, zips);
    return;
  }
  const path = entry.fullPath.replace(/^\//, "");
  if (/\.zip$/i.test(path)) zips.push(await entryFile(entry as FileSystemFileEntry));
  else if (isRelevantPath(path)) out.push({ path, html: await (await entryFile(entry as FileSystemFileEntry)).text() });
}

/** ドラッグ＆ドロップされたもの（ZIP でもフォルダでもよい）。 */
export async function collectFromDrop(data: DataTransfer): Promise<ExportFile[]> {
  const entries = [...data.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return collectFromFiles([...data.files]);
  const out: ExportFile[] = [];
  const zips: File[] = [];
  for (const entry of entries) await walk(entry, out, zips);
  out.push(...(await collectFromFiles(zips)));
  return out;
}
