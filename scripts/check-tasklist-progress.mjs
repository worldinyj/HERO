#!/usr/bin/env node
/** Read-only, dependency-free validation of the 86-item HERO task audit. */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(join(root, path), "utf8");
const source = read("docs/04_TASKLIST.md");
const audit = JSON.parse(read("ops/tasklist-progress.json"));
const ids = [...source.matchAll(/^\| (T[0-7]-\d+[a-z]?) \|/gm)].map(m => m[1]);
const listed = audit.tasks.map(task => task.id);
const valid = new Set(["implemented", "partial", "not_started"]);
const errors = [];
if(ids.length !== 86)errors.push("source TASKLIST no longer has 86 MVP IDs");
if(new Set(ids).size !== ids.length)errors.push("source TASKLIST contains duplicate IDs");
if(listed.length !== ids.length || listed.some((id, i) => id !== ids[i]))
  errors.push("audit IDs missing/reordered relative to canonical TASKLIST");
if(new Set(listed).size !== listed.length)errors.push("audit has duplicate IDs");
for(const task of audit.tasks) {
  if(!valid.has(task.status))errors.push(task.id+": unknown status");
  if(typeof task.evidence !== "string" || !task.evidence.trim())errors.push(task.id+": missing evidence");
  if(typeof task.note !== "string" || !task.note.trim())errors.push(task.id+": missing qualification");
  if(task.evidence) {
    try { read(task.evidence); }
    catch { errors.push(task.id+": evidence file absent: "+task.evidence); }
  }
}
if(audit.sourceTasklist !== "docs/04_TASKLIST.md")errors.push("incorrect source tasklist");
const counts = { implemented:0, partial:0, not_started:0 };
for(const t of audit.tasks)if(valid.has(t.status))counts[t.status]++;
const pct = Number(((counts.implemented+counts.partial*0.5)/ids.length*100).toFixed(1));
console.log(JSON.stringify({taskCount:ids.length,counts,implementationProgressPercent:pct,
  limitations:"implementation-weighted estimate, NOT DoD/CI/pgTAP/release status"},null,2));
for(const error of errors)console.error("FAIL "+error);
if(errors.length)process.exitCode=1;
else console.log("PASS TASKLIST/source/evidence integrity (static only)");
