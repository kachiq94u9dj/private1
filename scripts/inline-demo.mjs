// dist-demo の JS / CSS を 1 つの HTML にまとめる（demo/index.html を出力）。
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const assets = readdirSync("dist-demo/assets");
const js = assets.filter((f) => f.endsWith(".js")).map((f) => readFileSync(`dist-demo/assets/${f}`, "utf8")).join("\n");
const css = assets.filter((f) => f.endsWith(".css")).map((f) => readFileSync(`dist-demo/assets/${f}`, "utf8")).join("\n");

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Screen Time Insights</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
mkdirSync("demo", { recursive: true });
writeFileSync("demo/index.html", html);
console.log(`demo/index.html (${Math.round(html.length / 1024)} KB)`);
