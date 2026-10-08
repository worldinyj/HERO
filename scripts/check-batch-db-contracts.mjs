#!/usr/bin/env node
/** Offline/static gate only. No database queries or GitHub Actions. */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
const read = p => readFileSync(join(resolve(import.meta.dirname, ".."), p), "utf8");
const tests = [
["leaderboard_projection_lifecycle",23],["leaderboard_plant_identity",12],
["my_record_summary",8],["invitation_atomic_reissue",21],
["invitation_atomic_cancel",27],["invitation_atomic_creation",27],
["player_status_atomic",30],["nickname_force_reset_atomic",33],
["nickname_self_change_atomic",37]
];
const migrations = ["leaderboard_public_projection","atomic_invitation_reissue",
"atomic_invitation_cancel","atomic_invitation_creation","atomic_player_status",
"atomic_nickname_force_reset","atomic_nickname_self_change"].map((s,i)=>
"supabase/migrations/20261008"+String(i+16).padStart(4,"0")+"_"+s+".sql");
const rpcs = [
["reissue_invitation_atomic",1,"manager-user-action"],
["cancel_invitation_atomic",2,"manager-user-action"],
["create_invitation_atomic",3,"create-invite"],
["set_player_active_atomic",4,"manager-user-action"],
["force_reset_nickname_atomic",5,"nickname-action"],
["change_nickname_self_atomic",6,"nickname-action"]
];
let failures=0, total=0;
function check(ok,msg) { console.log((ok?"PASS ":"FAIL ")+msg); if(!ok)failures++; }
for(const [name,expected] of tests) {
  const sql=read("supabase/tests/"+name+".test.sql");
  const plan=Number(sql.match(/\bselect\s+plan\((\d+)\)/i)?.[1]??-1);
  const count=(sql.match(/^\s*select\s+(?:ok|is|lives_ok|throws_ok|results_eq)\s*\(/gim)||[]).length;
  total+=count;
  check(count===expected && plan===count, name+": "+count+"/"+expected+" declarations");
  check(/\bbegin\s*;/i.test(sql)&&/\brollback\s*;/i.test(sql),name+": rollback fixture");
}
check(total===218,"pgTAP declarations total 218 (NOT executed)");
for(const path of migrations) {
  const sql=read(path);
  check(/^\s*begin\s*;/im.test(sql)&&/^\s*commit\s*;/im.test(sql),path+": transaction boundary");
}
for(const [fn,index,edgeName] of rpcs) {
  const sql=read(migrations[index]), edge=read("supabase/functions/"+edgeName+"/index.ts");
  check(sql.includes("create or replace function public."+fn+"(")&&
    /security\s+definer/i.test(sql)&&/set\s+search_path\s*=\s*''/i.test(sql)&&
    sql.includes("revoke all on function public."+fn+"(")&&
    /from\s+public,\s*anon,\s*authenticated\s*;/i.test(sql)&&
    sql.includes("grant execute on function public."+fn+"(")&&
    /to\s+service_role\s*;/i.test(sql),fn+": locked-down RPC");
  check(edge.includes('"'+fn+'"'),edgeName+": "+fn+" wired");
}
for(const [fn,forbidden] of [
["manager-user-action","writeAuditLog("],
["create-invite","writeAuditLog("],
["nickname-action","writeAuditLog("]]) {
  check(!read("supabase/functions/"+fn+"/index.ts").includes(forbidden),fn+": no split audit write");
}
console.log(failures?"STATIC CONTRACT CHECK FAIL: "+failures:
"STATIC CONTRACT CHECK PASS. PostgreSQL/pgTAP/E2E NOT RUN.");
if(failures)process.exitCode=1;
