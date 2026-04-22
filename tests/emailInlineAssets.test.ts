import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getInlineAsset } from "../supabase/functions/_shared/emailInlineAssets";

describe("email inline assets", () => {
  it("keeps repaired inline icons synced with the checked-in PNG sources", () => {
    for (const key of ["shield", "quiz", "facebook"] as const) {
      const inlineAsset = getInlineAsset(key);
      const fileBuffer = readFileSync(`public/images/email-icons/${key}.png`);

      expect(Buffer.from(inlineAsset.base64Data, "base64").equals(fileBuffer)).toBe(true);
      expect(fileBuffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });
});
