// エクスポート ZIP から必要な HTML だけを取り出す。
// Instagram のエクスポートは写真・動画込みで数 GB になるため、ZIP 全体をメモリに載せず、
// 目次（セントラルディレクトリ）を読んでから必要なファイルだけを展開する。ブラウザと Node の両方で使う。
import { BlobReader, TextWriter, ZipReader, configure } from "@zip.js/zip.js";
import { isRelevantPath, type ExportFile } from "./parse";

configure({ useWebWorkers: false });

export interface ZipContents {
  /** 解析に使う HTML。 */
  files: ExportFile[];
  /** ZIP 内のすべてのファイル名（読めないときの手がかり用）。 */
  names: string[];
}

export async function readExportZip(zip: Blob): Promise<ZipContents> {
  const reader = new ZipReader(new BlobReader(zip));
  try {
    const entries = (await reader.getEntries()).filter((e) => !e.directory);
    const files: ExportFile[] = [];
    for (const entry of entries) {
      if (!isRelevantPath(entry.filename) || !entry.getData) continue;
      files.push({ path: entry.filename, html: await entry.getData(new TextWriter()) });
    }
    return { files, names: entries.map((e) => e.filename) };
  } finally {
    await reader.close();
  }
}
