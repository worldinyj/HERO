import { readJsonObject } from "./jsonObject.ts";

function postJson(raw: string) {
  return new Request("https://hero.example/nickname-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}
Deno.test("object bodies are accepted without executing any mutation", async () => {
  for (const body of ["{}", '{"action":"status"}', '{"profileId":null}']) {
    if ((await readJsonObject(postJson(body))) === null) throw new Error("object rejected");
  }
});
Deno.test("malformed JSON, arrays, null and scalars fail before mutation", async () => {
  for (const body of ["", "{", "null", "[]", "42", '"text"', "true"]) {
    if ((await readJsonObject(postJson(body))) !== null) throw new Error("non-object accepted");
  }
});
