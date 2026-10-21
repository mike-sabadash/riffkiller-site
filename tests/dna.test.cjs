const {test}=require('node:test');
const assert=require('node:assert/strict');
const V=require('../js/riff-dna-vocab.js').RiffDNAVocab;

test('every role has a method colour and a hint',()=>{
    for(const r of V.roles){const role=V.role(r.key);assert.match(role.color,/^#[0-9A-F]{6}$/i);assert.ok(role.hint.length>10,r.key);}
});
test('older A/B lessons map to roles only when the name is a known verb',()=>{
    assert.equal(V.roleFromLegacy({molecule:'A',moleculeName:'The statement'}),'call');
    assert.equal(V.roleFromLegacy({molecule:'B',moleculeName:'The answer'}),'answer');
    assert.equal(V.roleFromLegacy({moleculeName:'Climb'}),'climb');
    assert.equal(V.roleFromLegacy({molecule:'A',moleculeName:'Riff part'}),'');
    assert.equal(V.roleFromLegacy({role:'',moleculeName:'The answer'}),'','An explicit empty role means a practice-only shot');
    assert.equal(V.roleFromLegacy({role:'land'}),'land');
    assert.equal(V.roleFromLegacy({role:'nonsense'}),'');
});
test('techniques resolve by key and unknown keys stay unknown',()=>{
    assert.equal(V.technique('qbend').label,'Quarter-tone bend');
    assert.equal(V.technique('nope'),null);
});
test('the phrase is the repeating block of any length, not only call/answer pairs',()=>{
    const p=keys=>{const r=V.phrase(keys);return r.unit.join(' ')+' x'+r.times;};
    assert.equal(p(['call','answer','call','answer','call','answer']),'call answer x3');
    assert.equal(p(['launch','push','land','launch','push','land']),'launch push land x2');
    assert.equal(p(['launch','','push','land','','launch','push','land']),'launch push land x2','practice-only shots are skipped');
    assert.equal(p(['call','push','call','call','push','call']),'call push call x2','a block may start and end on one role');
    assert.equal(p(['launch','launch','push','land','launch','push','push','land']),'launch push land x2','passes cut into different numbers of shots');
    assert.equal(p(['launch','climb','hang','turn','land']),'launch climb hang turn land x1');
    assert.equal(p(['launch','push','land','launch','push','turn']),'launch push land launch push turn x1','a varied last pass is shown in full');
    assert.equal(p([]),' x1');
});
