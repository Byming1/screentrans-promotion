import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { publishDesktop } from "./publish-desktop.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "screentrans-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installer = path.join(root, "ScreenTransSetup-0.1.4-win64.exe");
  const content = Buffer.from("MZ-not-a-real-installer-test-fixture");
  const manifestFile = path.join(root, "release.json");
  const manifest = {
    version: "0.1.4", bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    published: false, loginMode: "activation-code", url: null,
  };
  await writeFile(installer, content);
  await writeFile(manifestFile, JSON.stringify(manifest));
  const calls = [];
  const url = "https://github.com/Byming1/screentrans-promotion/releases/download/desktop-v0.1.4/ScreenTransSetup-0.1.4-win64.exe";
  let uploadDigest = `sha256:${manifest.sha256}`;
  let draftUrl = url, publishedUrl = url, tag = "desktop-v0.1.4", published = false, existingAsset = false;
  const asset = () => ({ id: 17, name: "ScreenTransSetup-0.1.4-win64.exe", size: manifest.bytes,
    digest: uploadDigest, browser_download_url: published ? publishedUrl : draftUrl });
  const release = () => ({ id: 7, name: "ScreenTrans Desktop 0.1.4 Beta", draft: !published,
    tag_name: tag, assets: existingAsset ? [asset()] : [],
    upload_url: "https://uploads.github.com/repos/Byming1/screentrans-promotion/releases/7/assets{?name,label}" });
  async function request(input, options) {
    calls.push({ url: String(input), method: options.method, body: typeof options.body === "string" ? JSON.parse(options.body) : null });
    if (String(input).startsWith("https://uploads.github.com/")) {
      for await (const ignored of options.body) assert.ok(ignored.length);
      return Response.json(asset());
    }
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body);
      assert.equal(body.tag_name, "desktop-v0.1.4");
      tag = body.tag_name; published = !body.draft;
      return Response.json(release());
    }
    if (String(input).endsWith("/releases/assets/17")) return Response.json(asset());
    return Response.json(release());
  }
  return { installer, manifestFile, manifest, calls, request, url,
    setDigest: (value) => { uploadDigest = value; },
    setDraftURL: (value) => { draftUrl = value; },
    setPublishedURL: (value) => { publishedUrl = value; },
    resume: (value) => { existingAsset = true; tag = value; },
  };
}

test("requires credentials before any network request", async (t) => {
  const f = await fixture(t);
  await assert.rejects(publishDesktop(f.installer, "", f), /Set GH_TOKEN/);
  assert.equal(f.calls.length, 0);
});

test("refuses a modified installer without uploading", async (t) => {
  const f = await fixture(t);
  await writeFile(f.installer, "wrong bytes");
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", f), /does not match/);
  assert.equal(f.calls.length, 0);
});

test("a mismatched upload remains draft and is not advertised", async (t) => {
  const f = await fixture(t);
  f.setDigest("sha256:wrong");
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", f), /digest mismatch/);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
  assert.equal(JSON.parse(await readFile(f.manifestFile)).published, false);
});

test("an absent GitHub digest is not silently accepted", async (t) => {
  const f = await fixture(t);
  f.setDigest(undefined);
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", f), /digest mismatch/);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
});

test("only advertises a versioned release after verified upload and publication", async (t) => {
  const f = await fixture(t);
  await publishDesktop(f.installer, "fake-test-token", f);
  const actual = JSON.parse(await readFile(f.manifestFile));
  assert.equal(actual.published, true);
  assert.equal(actual.url, f.url);
  assert.equal(actual.sha256, f.manifest.sha256);
  assert.equal(f.calls.some((call) => call.method === "PATCH" && call.body.draft === false), true);
  assert.ok(f.calls.at(-1).url.endsWith("/releases/assets/17"));
});

test("GitHub untagged draft URL is accepted without publishing", async (t) => {
  const f = await fixture(t);
  f.setDraftURL(f.url.replace("desktop-v0.1.4", "untagged-abcdef123"));
  await publishDesktop(f.installer, "fake-test-token", { ...f, draftOnly: true });
  assert.equal(JSON.parse(await readFile(f.manifestFile)).published, false);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
});

test("resumes the matching draft without another upload and restores its version tag", async (t) => {
  const f = await fixture(t);
  f.setDraftURL(f.url.replace("desktop-v0.1.4", "untagged-abcdef123"));
  f.resume("untagged-abcdef123");
  await publishDesktop(f.installer, "fake-test-token", { ...f, draftOnly: true, releaseId: 7 });
  assert.equal(f.calls.some((call) => call.method === "POST"), false);
  assert.deepEqual(f.calls.find((call) => call.method === "PATCH").body,
    { tag_name: "desktop-v0.1.4", draft: true, prerelease: true });
});

test("draft URL from a different repository is rejected", async (t) => {
  const f = await fixture(t);
  f.setDraftURL(f.url.replace("Byming1/screentrans-promotion", "other/repository"));
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", { ...f, draftOnly: true }), /Unexpected download URL/);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
});

test("a wrong draft asset name is rejected by URL validation", async (t) => {
  const f = await fixture(t);
  f.setDraftURL(f.url.replace("win64.exe", "win64.exe.html"));
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", { ...f, draftOnly: true }), /Unexpected download URL/);
});

test("publication explicitly assigns the version tag and rechecks the final asset URL", async (t) => {
  const f = await fixture(t);
  f.setDraftURL(f.url.replace("desktop-v0.1.4", "untagged-abcdef123"));
  await publishDesktop(f.installer, "fake-test-token", f);
  assert.deepEqual(f.calls.find((call) => call.method === "PATCH").body,
    { tag_name: "desktop-v0.1.4", draft: false, prerelease: true });
  assert.equal(JSON.parse(await readFile(f.manifestFile)).url, f.url);
});

test("an untagged URL after publication is never written to the download manifest", async (t) => {
  const f = await fixture(t);
  f.setPublishedURL(f.url.replace("desktop-v0.1.4", "untagged-abcdef123"));
  await assert.rejects(publishDesktop(f.installer, "fake-test-token", f), /Unexpected download URL/);
  assert.equal(JSON.parse(await readFile(f.manifestFile)).published, false);
});

test("a verified draft is not published or advertised before live account checks", async (t) => {
  const f = await fixture(t);
  const result = await publishDesktop(f.installer, "fake-test-token", { ...f, draftOnly: true });
  assert.equal(result.draft, true);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
  assert.equal(JSON.parse(await readFile(f.manifestFile)).published, false);
});
