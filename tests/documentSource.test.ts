// ==========================================================================
// Document source validation (CRIT-02 / SEC-03)
// --------------------------------------------------------------------------
// The endpoint fetches a client-supplied URL, so these are SSRF tests. Each
// case below corresponds to a way the original inline checks could be
// defeated:
//
//   * unset CLOUDINARY_CLOUD_NAME disabled the guard entirely (fail-open)
//   * `String.includes()` matched the host anywhere in the URL
//   * the ownership check only ran when the path happened to contain
//     "/schools/", which the client controls
// ==========================================================================
import { describe, it, expect } from "vitest";
import { checkDocumentSource, documentSourceStatus } from "../api/_lib/documentSource";

const CLOUD = "edvia-demo";
const SCHOOL = "sch_greenfield";
const UID = "uid_parent_1";
const OWNED = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/schools/${SCHOOL}/users/${UID}/homework.jpg`;

const check = (url: string, uid = UID) => checkDocumentSource(url, SCHOOL, uid, CLOUD);

describe("accepts only a genuinely owned Cloudinary asset", () => {
  it("accepts the caller's own upload", () => {
    expect(check(OWNED)).toEqual({ ok: true, url: OWNED });
  });

  it("accepts a nested path inside the caller's folder", () => {
    const nested = `https://res.cloudinary.com/${CLOUD}/image/upload/v1699/schools/${SCHOOL}/users/${UID}/sub/a.png`;
    expect(check(nested).ok).toBe(true);
  });
});

describe("fails closed when unconfigured", () => {
  it("refuses every URL when CLOUDINARY_CLOUD_NAME is unset", () => {
    // The original code skipped the check entirely in this state, which made
    // a missing environment variable equivalent to disabling SSRF defence.
    // Called directly rather than through `check`: passing `undefined` to a
    // parameter with a default value re-applies the default.
    const result = checkDocumentSource(OWNED, SCHOOL, UID, undefined);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(documentSourceStatus("not_configured")).toBe(503);
  });

  it("refuses when the caller has no school or uid", () => {
    expect(checkDocumentSource(OWNED, "", UID, CLOUD).ok).toBe(false);
    expect(checkDocumentSource(OWNED, SCHOOL, "", CLOUD).ok).toBe(false);
  });
});

describe("SSRF — host authority cannot be spoofed", () => {
  it("refuses an attacker host carrying the delivery host in its query string", () => {
    // The exact bypass the substring check allowed.
    const spoof = `https://evil.example/fetch?u=res.cloudinary.com/${CLOUD}/schools/${SCHOOL}/users/${UID}/x.jpg`;
    expect(check(spoof)).toEqual({ ok: false, reason: "untrusted_host" });
  });

  it("refuses a userinfo-prefixed authority", () => {
    const spoof = `https://res.cloudinary.com@evil.example/${CLOUD}/schools/${SCHOOL}/users/${UID}/x.jpg`;
    expect(check(spoof).ok).toBe(false);
  });

  it("refuses a subdomain of the attacker's choosing", () => {
    const spoof = `https://res.cloudinary.com.evil.example/${CLOUD}/schools/${SCHOOL}/users/${UID}/x.jpg`;
    expect(check(spoof)).toEqual({ ok: false, reason: "untrusted_host" });
  });

  it("refuses cloud metadata, localhost and private ranges", () => {
    for (const host of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/admin",
      "http://127.0.0.1/",
      "https://10.0.0.5/internal",
      "https://192.168.1.1/router",
      "https://[::1]/",
    ]) {
      expect(check(host).ok, host).toBe(false);
    }
  });

  it("refuses non-HTTPS schemes", () => {
    expect(check(`http://res.cloudinary.com/${CLOUD}/schools/${SCHOOL}/users/${UID}/x.jpg`)).toEqual({
      ok: false,
      reason: "insecure_protocol",
    });
    expect(check("file:///etc/passwd").ok).toBe(false);
    expect(check("gopher://res.cloudinary.com/x").ok).toBe(false);
  });

  it("refuses a malformed URL", () => {
    expect(check("not-a-url")).toEqual({ ok: false, reason: "invalid_url" });
    expect(check("")).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("account and ownership are unconditional", () => {
  it("refuses another Cloudinary account", () => {
    const other = `https://res.cloudinary.com/someone-else/image/upload/schools/${SCHOOL}/users/${UID}/x.jpg`;
    expect(other.includes(`res.cloudinary.com/${CLOUD}/`)).toBe(false);
    expect(check(other)).toEqual({ ok: false, reason: "wrong_cloud" });
  });

  it("refuses a file uploaded with NO folder at all", () => {
    // The client chooses the upload folder, so omitting it was how the old
    // `if (includes("/schools/"))` ownership check got skipped.
    const rootUpload = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/loose-file.jpg`;
    expect(check(rootUpload)).toEqual({ ok: false, reason: "not_owned" });
  });

  it("refuses another user's file in the same school", () => {
    const theirs = `https://res.cloudinary.com/${CLOUD}/image/upload/schools/${SCHOOL}/users/uid_other/report.pdf`;
    expect(check(theirs)).toEqual({ ok: false, reason: "not_owned" });
    expect(documentSourceStatus("not_owned")).toBe(403);
  });

  it("refuses the same uid in a different school", () => {
    const crossSchool = `https://res.cloudinary.com/${CLOUD}/image/upload/schools/sch_riverside/users/${UID}/x.jpg`;
    expect(check(crossSchool)).toEqual({ ok: false, reason: "not_owned" });
  });

  it("refuses a folder that merely looks like the owner's", () => {
    const lookalike = `https://res.cloudinary.com/${CLOUD}/image/upload/schools/${SCHOOL}/users/${UID}-evil/x.jpg`;
    expect(check(lookalike).ok).toBe(false);
  });
});
