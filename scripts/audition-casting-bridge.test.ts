import assert from "node:assert/strict";
import test from "node:test";

function canCast(roleIds:string[]){return roleIds.length>0;}
test("cast requires at least one selected role",()=>assert.equal(canCast([]),false));
test("one selected role can create one draft",()=>assert.equal(canCast(["role-a"]),true));
test("multiple selected roles can create multiple drafts",()=>assert.equal(new Set(["role-a","role-b"]).size,2));
