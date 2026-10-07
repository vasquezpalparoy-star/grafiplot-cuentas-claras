import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeStates,SyncConflict} from '../android-web/merge.ts';
const state=()=>({revision:1,settings:{currency:'PEN',cashFloat:60},entries:[],shifts:[],workers:[],attendance:[],yape:[],sources:[],audit:[],demo:false}) as any;
test('combina movimientos independientes sin duplicarlos',()=>{
 const base=state(),local=structuredClone(base),remote=structuredClone(base);
 local.entries.push({id:'a',amount:10});remote.entries.push({id:'b',amount:20});remote.revision=8;
 const merged=mergeStates(base,local,remote);
 assert.deepEqual(merged.entries,[{id:'a',amount:10},{id:'b',amount:20}]);assert.equal(merged.revision,8);
 assert.deepEqual(mergeStates(base,merged,merged).entries,merged.entries);
});
test('combina caja por fecha y turno y conserva modificaciones en campos separados',()=>{
 const base=state();base.shifts=[{date:'2026-10-07',shift:1,opening:60,counted:100}];
 const local=structuredClone(base),remote=structuredClone(base);
 local.shifts[0].counted=110;remote.shifts[0].opening=70;
 assert.deepEqual(mergeStates(base,local,remote).shifts,[{date:'2026-10-07',shift:1,opening:70,counted:110}]);
});
test('rechaza correcciones simultáneas del mismo importe sin modificar los originales',()=>{
 const base=state();base.entries=[{id:'a',amount:10}];const local=structuredClone(base),remote=structuredClone(base);
 local.entries[0].amount=15;remote.entries[0].amount=20;
 assert.throws(()=>mergeStates(base,local,remote),SyncConflict);assert.equal(local.entries[0].amount,15);assert.equal(remote.entries[0].amount,20);
});
test('propaga eliminación cuando el registro remoto no cambió',()=>{
 const base=state();base.entries=[{id:'a',amount:10}];const local=structuredClone(base);local.entries=[];
 assert.deepEqual(mergeStates(base,local,base).entries,[]);
});
test('detiene eliminación contra edición remota',()=>{
 const base=state();base.entries=[{id:'a',amount:10}];const local=structuredClone(base),remote=structuredClone(base);
 local.entries=[];remote.entries[0].amount=20;assert.throws(()=>mergeStates(base,local,remote),SyncConflict);
});
