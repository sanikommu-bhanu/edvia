// ==========================================================================
// Document source validation
// --------------------------------------------------------------------------
// api/ai/document.ts fetches a URL the CLIENT supplies. That is a
// server-side request forgery primitive unless it is constrained hard, so
// all of the constraining lives here, in one testable place.
//
// The audit found three defects in the original inline checks:
//
//   1. FAIL-OPEN. The cloud-name guard was `if (cloudName && ...)`. With
//      CLOUDINARY_CLOUD_NAME unset the check was skipped entirely and the
//      server would fetch ANY url — cloud metadata endpoints included.
//      Configuration being absent must never disable a security control.
//
//   2. SUBSTRING MATCHING. It used
//      `fileUrl.includes("res.cloudinary.com/<cloud>/")`, which matches
//      anywhere in the string. `https://evil.example/?x=res.cloudinary.com/mycloud/`
//      passed. Host authority can only be decided by parsing the URL.
//
//   3. CONDITIONAL OWNERSHIP. The per-user folder check only ran
//      `if (fileUrl.includes("/schools/"))`. Since the upload folder is a
//      client-supplied form field, omitting it removed the check.
//
// The rule now: HTTPS, host exactly res.cloudinary.com, first path segment
// exactly the configured cloud name, and the path must contain the caller's
// own derived folder prefix. Anything else is refused before a socket opens.
// ==========================================================================

/** Cloudinary's canonical delivery host. Nothing else is ever fetched. */
const DELIVERY_HOST = "res.cloudinary.com";

/** Hard ceiling on a fetched document, enforced by header AND by byte count. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** How long the server will wait for Cloudinary before giving up. */
export const FETCH_TIMEOUT_MS = 15_000;

export type DocumentSourceRejection =
  | "not_configured"
  | "invalid_url"
  | "insecure_protocol"
  | "untrusted_host"
  | "wrong_cloud"
  | "not_owned";

export type DocumentSourceCheck =
  { ok: true; url: string } | { ok: false; reason: DocumentSourceRejection };

/**
 * The folder every document scan must be uploaded into. Derived on the
 * server from the caller's VERIFIED context, never read from the request —
 * so a client cannot widen its own ownership scope by choosing a folder.
 */
export function documentOwnershipPrefix(schoolId: string, uid: string): string {
  return `/schools/${schoolId}/users/${uid}/`;
}

/**
 * Decides whether the server may fetch `rawUrl` on behalf of this caller.
 *
 * @param cloudName value of CLOUDINARY_CLOUD_NAME — absent means REFUSE
 */
export function checkDocumentSource(
  rawUrl: string,
  schoolId: string,
  uid: string,
  cloudName: string | undefined,
): DocumentSourceCheck {
  // Fail closed. A deployment that forgot the variable gets no fetching at
  // all rather than unrestricted fetching.
  if (!cloudName) return { ok: false, reason: "not_configured" };
  if (!schoolId || !uid) return { ok: false, reason: "not_owned" };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  // HTTPS only: no file:, no gopher:, no http: downgrade.
  if (url.protocol !== "https:")
    return { ok: false, reason: "insecure_protocol" };

  // Exact host match. Parsed, not substring-matched, so neither a userinfo
  // segment (https://res.cloudinary.com@evil.example/) nor a query parameter
  // can spoof the authority. This also inherently excludes localhost,
  // link-local 169.254.169.254 metadata endpoints and private ranges.
  if (url.hostname.toLowerCase() !== DELIVERY_HOST)
    return { ok: false, reason: "untrusted_host" };

  // Cloudinary delivery URLs are /<cloud_name>/<resource_type>/<...>. The
  // first path segment must be exactly our account.
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== cloudName) return { ok: false, reason: "wrong_cloud" };

  // Ownership is UNCONDITIONAL — the path must contain this caller's own
  // prefix. A file uploaded with no folder, or into someone else's folder,
  // is refused rather than silently skipping the check.
  if (!url.pathname.includes(documentOwnershipPrefix(schoolId, uid))) {
    return { ok: false, reason: "not_owned" };
  }

  return { ok: true, url: url.toString() };
}

/** User-facing message per rejection. Never discloses which rule tripped. */
export function documentSourceMessage(reason: DocumentSourceRejection): string {
  if (reason === "not_configured") {
    return "Document scanning isn't configured on this deployment yet.";
  }
  return "That file isn't one this account can open. Try uploading it again.";
}

/** HTTP status per rejection — configuration problems are not the user's fault. */
export function documentSourceStatus(reason: DocumentSourceRejection): number {
  if (reason === "not_configured") return 503;
  if (reason === "not_owned") return 403;
  return 400;
}
