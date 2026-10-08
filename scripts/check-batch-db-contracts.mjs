#!/usr/bin/env node
/** Offline/static gate only. No database queries or GitHub Actions. */
import { readFileSync, readdirSync } from "node:fs";
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

// Keep fixed UUID literals globally distinct across test files. A value
// in a different table would not conflict today, but distinct fixtures also
// prevent accidental test coupling when tables/joins evolve.
const testNames=readdirSync(resolve(import.meta.dirname,"../supabase/tests"))
  .filter(n=>n.endsWith(".test.sql")).sort();
const owners=new Map();
const collisions=[];
for(const name of testNames) {
  const content=read("supabase/tests/"+name);
  const ids=new Set((content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[])
    .map(v=>v.toLowerCase()));
  for(const id of ids) {
    if(owners.has(id)) collisions.push(id+" in "+owners.get(id)+" and "+name);
    else owners.set(id,name);
  }
}
for(const collision of collisions)console.error("DUPLICATE UUID "+collision);
check(testNames.length>=14 && collisions.length===0,
  testNames.length+" DB test files: fixed UUID namespace separation");

// Auth fixture e-mails must also be distinct across suites; a shared
// address could violate auth.users email uniqueness under parallel pgTAP.
const emailOwners=new Map(), duplicateEmails=[];
for(const name of testNames) {
  const addresses=new Set((read("supabase/tests/"+name).match(
    /[a-z0-9_.-]+@[a-z0-9_.-]+/gi
  )||[]).map(value=>value.toLowerCase()));
  for(const address of addresses) {
    if(emailOwners.has(address))duplicateEmails.push(address+" in "+emailOwners.get(address)+" and "+name);
    else emailOwners.set(address,name);
  }
}
for(const collision of duplicateEmails)console.error("DUPLICATE FIXTURE EMAIL "+collision);
check(duplicateEmails.length===0, emailOwners.size+" fixed auth fixture emails globally unique");


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

// Keep 017-022 explicit database exceptions in the Edge public error allowlist.
const errorSrc=read("supabase/functions/_shared/invitationErrorStatus.ts");
const errorBody=errorSrc.match(/const CLIENT_REJECTIONS[^=]*=\s*\{([\s\S]*?)\};/)?.[1]??"";
const known=new Map([...errorBody.matchAll(/^\s*([a-z][a-z0-9_]+):\s*(\d+)/gm)]
  .map(m=>[m[1],Number(m[2])]));
const raised=new Set();
for(const path of migrations.slice(1)) {
  for(const m of read(path).matchAll(/raise\s+exception\s+'([^']+)'/gi))raised.add(m[1]);
}
const unmatched=[...raised].filter(code=>!(known.get(code)>=400&&known.get(code)<500));
unmatched.forEach(code=>console.error("UNMAPPED DB DOMAIN ERROR "+code));
check(raised.size>=15&&unmatched.length===0,
  raised.size+" explicit SQL domain exceptions map to deterministic 4xx");
check(errorSrc.includes('code === "P0001"')&&
  errorSrc.includes("Object.hasOwn(CLIENT_REJECTIONS, message)")&&
  errorSrc.includes('error: "internal_error", status: 500'),
  "unknown SQL and transport failures remain opaque 500");

// SQL -> Edge DTO -> Admin/Manager response guards.
const client=read("apps/web/src/features/manager/inviteResponse.ts");
const managerUI=read("apps/web/src/features/manager/ManagerDashboardPage.tsx");
const adminUI=read("apps/web/src/features/admin/AdminOrgPage.tsx");
const panel=read("apps/web/src/features/manager/ManagerInvitePanel.tsx");
const edgeManager=read("supabase/functions/manager-user-action/index.ts");
const edgeCreate=read("supabase/functions/create-invite/index.ts");
check(["invitationId","expiresAt"].every(k=>
  read(migrations[3]).includes("'"+k+"'")&&edgeCreate.includes(k)&&client.includes(k)),
  "invitation issue: DB and Edge fields match browser");
check(["reissued","oldInvitationId","invitationId","expiresAt"].every(k=>
  read(migrations[1]).includes("'"+k+"'")&&edgeManager.includes(k))&&
  managerUI.includes("readReissuedInviteLink(result, invitationId)")&&
  adminUI.includes("readReissuedInviteLink(data, invitationId)")&&
  client.includes("result.oldInvitationId !== requestedInvitationId"),
  "invitation reissue: old/new IDs verified across layers");
check(["canceled","invitationId","canceledAt"].every(k=>
  read(migrations[2]).includes("'"+k+"'")&&edgeManager.includes(k))&&
  managerUI.includes("readCanceledInviteResult(result, invitationId)")&&
  adminUI.includes("readCanceledInviteResult(data, invitationId)"),
  "invitation cancel: target and cancellation timestamp verified");
check(["confirmPlayerStatus","confirmNicknameReset","confirmInvitationReconciliation"].every(k=>
  managerUI.includes("function "+k+"()"))&&
  adminUI.includes("function confirmAdminInvites()")&&
  panel.includes("function confirmInviteRoster()"),
  "uncertain operator actions require explicit confirmation");

for(const [fn,forbidden] of [
["manager-user-action","writeAuditLog("],
["create-invite","writeAuditLog("],
["nickname-action","writeAuditLog("]]) {
  check(!read("supabase/functions/"+fn+"/index.ts").includes(forbidden),fn+": no split audit write");
}
console.log(failures?"STATIC CONTRACT CHECK FAIL: "+failures:
"STATIC CONTRACT CHECK PASS. PostgreSQL/pgTAP/E2E NOT RUN.");
if(failures)process.exitCode=1;
