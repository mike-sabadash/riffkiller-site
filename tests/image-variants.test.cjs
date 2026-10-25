const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

function site(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    fs.mkdirSync(path.join(dir, 'config'));
    for (const f of ['image-variants.php', 'image-variants-cli.php']) fs.copyFileSync(path.join(root, 'config', f), path.join(dir, 'config', f));
    fs.mkdirSync(path.join(dir, 'data'));
    fs.mkdirSync(path.join(dir, 'assets/img/riffs'), {recursive: true});
    const picture = (name, size) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=' + size, '-frames:v', '1', path.join(dir, name)]);
    picture('assets/img/riffs/big.png', '1600x960');
    picture('assets/img/small.png', '428x360');
    picture('assets/img/banner.jpg', '2400x400');
    fs.writeFileSync(path.join(dir, 'data/riffs.json'), JSON.stringify([{id: 1, thumbnail: 'assets/img/riffs/big.png'}, {id: 2, thumbnail: 'assets/img/small.png'}, {id: 3, thumbnail: 'assets/img/missing.png'}]));
    fs.writeFileSync(path.join(dir, 'data/collections.json'), JSON.stringify([{id: 1, imageUrl: 'assets/img/small.png', bannerUrl: 'assets/img/banner.jpg'}]));
    return dir;
}
const cli = dir => execFileSync('php', [path.join(dir, 'config/image-variants-cli.php'), '--all'], {encoding: 'utf8'}).trim();
const srcset = (dir, p) => execFileSync('php', ['-r', 'require $argv[1]; echo image_srcset($argv[2]);', path.join(dir, 'config/image-variants.php'), p], {encoding: 'utf8'});

test('covers get light WebP copies up to their own width, once; srcset lists what exists', t => {
    const dir = site(t);
    assert.equal(cli(dir), 'Cover pictures: 4, WebP copies written: 8, without copies: 1');
    assert.equal(srcset(dir, 'assets/img/riffs/big.png'), 'assets/img/riffs/big.w400.webp 400w, assets/img/riffs/big.w800.webp 800w, assets/img/riffs/big.w1200.webp 1200w');
    assert.equal(srcset(dir, 'assets/img/small.png'), 'assets/img/small.w400.webp 400w, assets/img/small.w428.webp 428w', 'never upscaled');
    assert.equal(srcset(dir, 'assets/img/banner.jpg'), 'assets/img/banner.w800.webp 800w, assets/img/banner.w1200.webp 1200w, assets/img/banner.w2400.webp 2400w');
    assert.equal(srcset(dir, 'assets/img/missing.png'), '');
    assert.equal(srcset(dir, '../etc/passwd.png'), '');
    const big = fs.statSync(path.join(dir, 'assets/img/riffs/big.png')).size, small = fs.statSync(path.join(dir, 'assets/img/riffs/big.w400.webp')).size;
    assert.ok(small * 5 < big, small + ' vs ' + big);
    assert.equal(cli(dir), 'Cover pictures: 4, WebP copies written: 0, without copies: 1', 'second run only checks');
});
