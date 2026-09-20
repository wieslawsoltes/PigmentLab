import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationWGSL } from '@pigmentlab/kernels';
import { compositorWGSL } from '@pigmentlab/renderer';
import { CELL_BYTES } from '@pigmentlab/core';
// This lint is intentionally NOT a substitute for compiling and running on a GPU adapter.
// Reserved identifier inventory: W3C WGSL §16.2, https://www.w3.org/TR/WGSL/#reserved-words
const reserved = new Set(`NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield`.split(/\s+/));
for (const [name, source] of [['simulation', simulationWGSL], ['compositor', compositorWGSL]]) {
    test(`${name} WGSL contains no reserved-word identifiers`, () => {
        const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const words = uncommented.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        assert.deepEqual([...new Set(words.filter(w => reserved.has(w)))], []);
    });
    test(`${name} cell layout is three 16-byte vectors`, () => {
        const body = /struct Cell\s*\{([^}]+)\}/.exec(source)[1];
        assert.equal((body.match(/vec4<f32>/g) || []).length, 3);
        assert.equal(CELL_BYTES, 48);
    });
}
test('Compute entrypoints declare bounded workgroups and nonaliasing input/output bindings', () => {
    assert.equal((simulationWGSL.match(/@workgroup_size\(8,8,1\)/g) || []).length, 3);
    assert.match(simulationWGSL, /var<storage,read> source/);
    assert.match(simulationWGSL, /var<storage,read_write> destination/);
    assert.equal(new Set([...simulationWGSL.matchAll(/@binding\((\d+)\)/g)].map(m => m[1])).size, 8);
});
