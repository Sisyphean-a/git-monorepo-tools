import assert from 'node:assert/strict';
import test from 'node:test';
import { sortPullResults } from './pull-results.js';
function result(overrides) {
    return {
        id: overrides.id,
        name: overrides.id,
        path: `/repos/${overrides.id}`,
        result: overrides.result,
        detail: overrides.detail ?? overrides.result,
        commits: overrides.commits,
    };
}
test('sortPullResults puts changed and exceptional repos before no-op repos', () => {
    const ordered = sortPullResults([
        result({ id: 'uptodate-a', result: 'uptodate' }),
        result({ id: 'pulled', result: 'pulled', commits: 1 }),
        result({ id: 'skipped', result: 'skipped' }),
        result({ id: 'failed', result: 'failed' }),
        result({ id: 'uptodate-b', result: 'uptodate' }),
    ]);
    assert.deepEqual(ordered.map(item => item.id), ['failed', 'pulled', 'skipped', 'uptodate-a', 'uptodate-b']);
});
test('sortPullResults keeps same-priority repos stable except for larger commit counts first', () => {
    const ordered = sortPullResults([
        result({ id: 'pulled-small', result: 'pulled', commits: 1 }),
        result({ id: 'pulled-large', result: 'pulled', commits: 4 }),
        result({ id: 'skipped-a', result: 'skipped' }),
        result({ id: 'skipped-b', result: 'skipped' }),
    ]);
    assert.deepEqual(ordered.map(item => item.id), ['pulled-large', 'pulled-small', 'skipped-a', 'skipped-b']);
});
