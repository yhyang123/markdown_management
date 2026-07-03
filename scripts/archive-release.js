const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const packageJson = require(path.join(projectRoot, "package.json"));
const distDir = path.join(projectRoot, "dist");
const releaseRoot = path.join(projectRoot, "releases");
const version = packageJson.version;
const releaseDir = path.join(releaseRoot, `v${version}`);
const createdAt = new Date().toISOString();

if (!fs.existsSync(distDir)) {
  throw new Error("dist directory not found. Run npm run dist first.");
}

const artifactNames = fs
  .readdirSync(distDir)
  .filter((name) => {
    const ext = path.extname(name);
    const isReleaseArtifact = ext === ".dmg" || ext === ".blockmap";
    return isReleaseArtifact && name.includes(`-${version}-`);
  })
  .sort();

if (artifactNames.length === 0) {
  throw new Error(`No v${version} release artifacts found in dist. Run npm run dist first.`);
}

fs.mkdirSync(releaseDir, { recursive: true });

const artifacts = artifactNames.map((name) => {
  const source = path.join(distDir, name);
  const target = path.join(releaseDir, name);
  fs.copyFileSync(source, target);

  const buffer = fs.readFileSync(target);
  const stats = fs.statSync(target);

  return {
    file: name,
    bytes: stats.size,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex")
  };
});

const manifest = {
  name: packageJson.name,
  productName: packageJson.build?.productName || packageJson.name,
  version,
  createdAt,
  artifacts
};

fs.writeFileSync(
  path.join(releaseDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const lines = [
  `# ${manifest.productName} v${version}`,
  "",
  `Created at: ${createdAt}`,
  "",
  "| File | Size | SHA-256 |",
  "| --- | ---: | --- |",
  ...artifacts.map((artifact) => {
    return `| ${artifact.file} | ${artifact.bytes} | ${artifact.sha256} |`;
  }),
  ""
];

fs.writeFileSync(path.join(releaseDir, "README.md"), lines.join("\n"), "utf8");

console.log(`Archived ${artifacts.length} artifact(s) to ${path.relative(projectRoot, releaseDir)}`);
