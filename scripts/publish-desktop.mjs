import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, stat, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = path.join(root, "frontend/screentrans-frontend/src/desktop-release.json");
const repository = "Byming1/screentrans-promotion";

export async function publishDesktop(installer, token, { manifestFile = manifestPath, request = fetch, draftOnly = false } = {}) {
  if (!token) throw new Error("Set GH_TOKEN with release-write access; never commit it.");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const name = `ScreenTransSetup-${manifest.version}-win64.exe`;
  if (path.basename(installer) !== name) throw new Error(`Expected installer named ${name}`);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(installer)) digest.update(chunk);
  if (digest.digest("hex") !== manifest.sha256 || (await stat(installer)).size !== manifest.bytes) {
    throw new Error("Installer does not match the reviewed manifest. Nothing uploaded.");
  }
  const headers = {
    Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ScreenTrans-release",
  };
  async function api(endpoint, options = {}) {
    const response = await request(`https://api.github.com/repos/${repository}${endpoint}`, {
      ...options, headers: { ...headers, "Content-Type": "application/json", ...options.headers },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}; no credentials logged.`);
    return response.json();
  }
  // Use a versioned tag; an existing release must be inspected, not overwritten.
  const release = await api("/releases", {
    method: "POST", body: JSON.stringify({
      tag_name: `desktop-v${manifest.version}`, name: `ScreenTrans Desktop ${manifest.version} Beta`,
      draft: true, prerelease: true,
      body: `Windows x64 beta. SHA-256: ${manifest.sha256}\n\n` +
        `Sign-in: ${manifest.loginMode}. Unsigned. Native Windows capture/overlay not verified.`,
    }),
  });
  console.log(`Draft release ${release.id} created. If upload fails, inspect this draft before retrying.`);
  const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ""));
  if (uploadUrl.hostname !== "uploads.github.com") throw new Error("Unexpected upload host");
  uploadUrl.searchParams.set("name", name);
  const response = await request(uploadUrl, {
    method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(manifest.bytes) },
    body: createReadStream(installer), duplex: "half",
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}); release remains draft.`);
  const asset = await response.json();
  if (asset.size !== manifest.bytes || asset.digest !== `sha256:${manifest.sha256}`) {
    throw new Error("GitHub asset size/digest mismatch or unavailable; release remains draft.");
  }
  const prefix = `https://github.com/${repository}/releases/download/desktop-v${manifest.version}/`;
  if (!asset.browser_download_url.startsWith(prefix)) throw new Error("Unexpected download URL");
  if (draftOnly) {
    console.log(`Verified draft release ${release.id}. Download manifest remains unpublished.`);
    return { releaseId: release.id, assetId: asset.id, draft: true };
  }
  await api(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify({ draft: false }) });
  const temporary = manifestFile + ".tmp";
  await writeFile(temporary, JSON.stringify({ ...manifest, published: true, url: asset.browser_download_url }, null, 2) + "\n");
  await rename(temporary, manifestFile);
  console.log(`Published ${asset.browser_download_url}. Commit/deploy the updated manifest separately.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const draftOnly = args.includes("--draft");
  const files = args.filter((arg) => arg !== "--draft");
  if (files.length !== 1) throw new Error("Usage: GH_TOKEN=... node scripts/publish-desktop.mjs [--draft] /path/to/installer.exe");
  await publishDesktop(path.resolve(files[0]), process.env.GH_TOKEN, { draftOnly });
}
