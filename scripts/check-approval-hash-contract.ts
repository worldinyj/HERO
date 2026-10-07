import assert from "node:assert/strict";
import {
  approvedContentHashMatches,
  isSha256Hex,
  sha256Content,
} from "./scenario-approval-integrity.ts";

const reviewed = Buffer.from(
  '{"id":"reviewed-scenario","version":1}\n',
  "utf8",
);
const approvedHash = sha256Content(reviewed);

assert.equal(isSha256Hex(approvedHash), true);
assert.equal(approvedHash.length, 64);
assert.equal(approvedContentHashMatches(approvedHash, reviewed), true);

const changed = Buffer.from(
  '{"id":"reviewed-scenario","version":2}\n',
  "utf8",
);
assert.equal(approvedContentHashMatches(approvedHash, changed), false);
assert.equal(approvedContentHashMatches("not-a-sha", reviewed), false);

console.log(
  `APPROVAL_HASH_CONTRACT_PASS: reviewed content is bound to sha256=${approvedHash}`,
);
