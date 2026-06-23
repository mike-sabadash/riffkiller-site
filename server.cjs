const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3001;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');

const RIFFS_FILE = path.join(DATA_DIR, 'riffs.json');
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

function readJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 4), 'utf8');
}

function buildCollectionsList() {
    const meta = readJSON(COLLECTIONS_FILE);
    const riffs = readJSON(RIFFS_FILE);
    return meta.filter(c => c && c.id).map(c => {
        const cid = Number(c.id);
        const riffIds = riffs.filter(r => r && r.id && Array.isArray(r.collectionIds) && r.collectionIds.includes(cid)).map(r => Number(r.id));
        riffIds.sort((a, b) => a - b);
        return { id: cid, name: String(c.name || ''), imageUrl: String(c.imageUrl || 'assets/img/collections-1.png'), isFavorite: !!c.isFavorite, riffs: riffIds, videoCount: riffIds.length };
    });
}

function stripCollectionIdFromRiffs(collectionId) {
    if (!fs.existsSync(RIFFS_FILE)) return true;
    const list = readJSON(RIFFS_FILE);
    let changed = false;
    list.forEach(r => {
        if (r && Array.isArray(r.collectionIds)) {
            const filtered = r.collectionIds.filter(id => Number(id) !== Number(collectionId));
            if (filtered.length !== r.collectionIds.length) { r.collectionIds = filtered; changed = true; }
        }
    });
    if (changed) writeJSON(RIFFS_FILE, list);
    return true;
}

app.get('/api/riffs/list.php', (req, res) => {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(readJSON(RIFFS_FILE));
});

app.post('/api/riffs/save.php', (req, res) => {
    const riff = req.body && req.body.riff;
    if (!riff || !riff.song || !riff.artist) return res.status(400).json({ success: false, error: 'riff.song and riff.artist required' });
    const list = readJSON(RIFFS_FILE);
    const id = Number(riff.id) || 0;
    if (id > 0) {
        const idx = list.findIndex(r => r && Number(r.id) === id);
        if (idx >= 0) list[idx] = riff; else { riff.id = id; list.push(riff); }
    } else {
        const maxId = list.reduce((m, r) => Math.max(m, Number(r && r.id) || 0), 0);
        riff.id = maxId + 1;
        list.push(riff);
    }
    writeJSON(RIFFS_FILE, list);
    res.json({ success: true, riff });
});

app.post('/api/riffs/delete.php', (req, res) => {
    const id = Number(req.body && req.body.id) || 0;
    if (id <= 0) return res.status(400).json({ success: false, error: 'id required' });
    const list = readJSON(RIFFS_FILE);
    const newList = list.filter(r => !r || !r.id || Number(r.id) !== id);
    writeJSON(RIFFS_FILE, newList);
    res.json({ success: true, deleted: true });
});

app.post('/api/riffs/reorder.php', (req, res) => {
    const order = req.body && req.body.order;
    if (!Array.isArray(order) || order.length === 0) return res.status(400).json({ success: false, error: 'order array required' });
    const list = readJSON(RIFFS_FILE);
    const byId = {};
    list.forEach(r => { if (r && r.id) byId[Number(r.id)] = r; });
    const ordered = [];
    order.forEach(id => { if (byId[Number(id)]) ordered.push(byId[Number(id)]); });
    list.forEach(r => { if (r && r.id && !order.includes(Number(r.id))) ordered.push(r); });
    writeJSON(RIFFS_FILE, ordered);
    res.json({ success: true });
});

app.get('/api/collections/list.php', (req, res) => {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(buildCollectionsList());
});

app.post('/api/collections/save.php', (req, res) => {
    const collection = req.body && req.body.collection;
    if (!collection || !String(collection.name || '').trim()) return res.status(400).json({ success: false, error: 'collection.name required' });
    let imageUrl = String(collection.imageUrl || '').trim() || 'assets/img/collections-1.png';
    const list = readJSON(COLLECTIONS_FILE);
    const id = Number(collection.id) || 0;
    const out = { name: String(collection.name).trim(), imageUrl, isFavorite: !!collection.isFavorite };
    if (id > 0) {
        const idx = list.findIndex(c => c && Number(c.id) === id);
        out.id = id;
        if (idx >= 0) list[idx] = out; else list.push(out);
    } else {
        const maxId = list.reduce((m, c) => Math.max(m, Number(c && c.id) || 0), 0);
        out.id = maxId + 1;
        list.push(out);
    }
    writeJSON(COLLECTIONS_FILE, list);
    const built = buildCollectionsList();
    const full = built.find(c => Number(c.id) === Number(out.id)) || { ...out, riffs: [], videoCount: 0 };
    res.json({ success: true, collection: full });
});

app.post('/api/collections/delete.php', (req, res) => {
    const id = Number(req.body && req.body.id) || 0;
    if (id <= 0) return res.status(400).json({ success: false, error: 'id required' });
    const list = readJSON(COLLECTIONS_FILE);
    const newList = list.filter(c => !c || !c.id || Number(c.id) !== id);
    writeJSON(COLLECTIONS_FILE, newList);
    stripCollectionIdFromRiffs(id);
    res.json({ success: true, deleted: true });
});

const upload = multer({ dest: path.join(ROOT, 'uploads', '_tmp') });
app.post('/api/upload.php', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
    const destPath = String(req.body.path || '').trim();
    if (!destPath || destPath.includes('..') || /[^a-zA-Z0-9/_.\-]/.test(destPath)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Invalid path' });
    }
    const fullDest = path.join(ROOT, destPath);
    const dir = path.dirname(fullDest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(req.file.path, fullDest);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, path: destPath });
});

app.get('/video.php', (req, res) => {
    const file = String(req.query.file || '');
    if (!file || file.includes('..')) return res.status(404).end();
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    const stat = fs.statSync(filePath);
    const size = stat.size;
    res.header('Content-Type', 'video/mp4');
    res.header('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        if (!m) return res.status(416).end();
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : size - 1;
        if (start > end || start > size - 1) {
            res.header('Content-Range', `bytes */${size}`);
            return res.status(416).end();
        }
        if (end >= size) end = size - 1;
        const len = end - start + 1;
        res.status(206);
        res.header('Content-Range', `bytes ${start}-${end}/${size}`);
        res.header('Content-Length', len);
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.header('Content-Length', size);
        fs.createReadStream(filePath).pipe(res);
    }
});

app.use(express.static(ROOT, { index: 'index.html' }));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
