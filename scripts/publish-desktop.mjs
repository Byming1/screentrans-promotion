import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, stat, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = path.join(root, "frontend/screentrans-frontend/src/desktop-release.json");
const repository = "Byming1/screentrans-promotion";

export async function publishDesktop(installer, token, { manifestFile = manifestPath, request = fetch, draftOnly = false, releaseId } = {}) {
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
  const tag = `desktop-v${manifest.version}`;
  const title = `ScreenTrans Desktop ${manifest.version} Beta`;
  function verifyAsset(asset, draft) {
    if (asset.name !== name || asset.size !== manifest.bytes || asset.digest !== `sha256:${manifest.sha256}`) {
      throw new Error("GitHub asset name/size/digest mismatch or unavailable; manifest unchanged.");
    }
    const url = new URL(asset.browser_download_url);
    const parts = url.pathname.split("/");
    const validRef = parts[5] === tag || (draft && /^untagged-[a-zA-Z0-9]+$/.test(parts[5] || ""));
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash ||
        parts.slice(1, 5).join("/") !== `${repository}/releases/download` || parts.length !== 7 ||
        parts[6] !== name || !validRef) throw new Error("Unexpected download URL for release state");
  }
  if (releaseId !== undefined && (!Number.isSafeInteger(releaseId) || releaseId <= 0)) throw new Error("Invalid release ID");
  const release = releaseId ? await api(`/releases/${releaseId}`) : await api("/releases", {
    method: "POST", body: JSON.stringify({
      tag_name: tag, name: title,
      draft: true, prerelease: true,
      body: `Windows x64 beta. SHA-256: ${manifest.sha256}\n\n` +
        `Sign-in: ${manifest.loginMode}. Unsigned. Native Windows capture/overlay not verified.`,
    }),
  });
  if (release.draft !== true || release.name !== title ||
      (release.tag_name !== tag && !/^untagged-[a-zA-Z0-9]+$/.test(release.tag_name || ""))) {
    throw new Error("Release is not the expected versioned draft; nothing overwritten.");
  }
  console.log(`Using draft release ${release.id}. Failed uploads are never published.`);
  let asset = release.assets?.find((item) => item.name === name);
  if (!asset) {
    const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ""));
    if (uploadUrl.origin !== "https://uploads.github.com" || uploadUrl.username || uploadUrl.password ||
        !uploadUrl.pathname.startsWith(`/repos/${repository}/releases/`)) throw new Error("Unexpected upload host/path");
    uploadUrl.searchParams.set("name", name);
    const response = await request(uploadUrl, {
      method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(manifest.bytes) },
      body: createReadStream(installer), duplex: "half",
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status}); release remains draft.`);
    asset = await response.json();
  }
  verifyAsset(asset, true);
  if (draftOnly) {
    if (release.tag_name !== tag) {
      const updated = await api(`/releases/${release.id}`, {
        method: "PATCH", body: JSON.stringify({ tag_name: tag, draft: true, prerelease: true }),
      });
      if (updated.draft !== true || updated.tag_name !== tag) throw new Error("Draft metadata update did not preserve the requested tag/state");
    }
    console.log(`Verified draft release ${release.id}. Download manifest remains unpublished.`);
    return { releaseId: release.id, assetId: asset.id, draft: true };
  }
  const published = await api(`/releases/${release.id}`, {
    method: "PATCH", body: JSON.stringify({ tag_name: tag, draft: false, prerelease: true }),
  });
  if (published.draft !== false || published.tag_name !== tag) throw new Error("Published release state/tag mismatch; manifest unchanged");
  const confirmed = await api(`/releases/assets/${asset.id}`);
  verifyAsset(confirmed, false);
  const temporary = manifestFile + ".tmp";
  await writeFile(temporary, JSON.stringify({ ...manifest, published: true, url: confirmed.browser_download_url }, null, 2) + "\n");
  await rename(temporary, manifestFile);
  console.log(`Published ${confirmed.browser_download_url}. Commit/deploy the updated manifest separately.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ options: { draft: { type: "boolean", default: false }, "release-id": { type: "string" } }, allowPositionals: true });
  if (positionals.length !== 1) throw new Error("Usage: GH_TOKEN=... node scripts/publish-desktop.mjs [--draft] [--release-id ID] /path/to/installer.exe");
  await publishDesktop(path.resolve(positionals[0]), process.env.GH_TOKEN, {
    draftOnly: values.draft, releaseId: values["release-id"] === undefined ? undefined : Number(values["release-id"]),
  });
}
