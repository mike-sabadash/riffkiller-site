#!/usr/bin/env python3
"""Preflight by default. Explicit --apply copies the checked release and restores media.

Only allowlisted files are read from the historical ZIP; accounts and secrets stay on the server.
"""
import argparse
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from zipfile import ZipFile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def merge_catalog(current, reference):
    result = copy.deepcopy(current)
    for restored in reference:
        existing = next((r for r in result if r.get('id') == restored.get('id')), None)
        if existing is None:
            result.append(copy.deepcopy(restored))
            continue
        if existing.get('song') != restored.get('song') or existing.get('artist') != restored.get('artist'):
            raise ValueError(f"Riff ID {restored['id']} belongs to another lesson; manual reconciliation required")
        if existing.get('id') == 6 and existing.get('videoFile') == 'assets/video/led-zeppelin/whole-lotta-love/left.mp4':
            existing['videoFile'] = restored['videoFile']
        if existing.get('id') == 6 and existing.get('videoFileRight') == 'assets/video/led-zeppelin/whole-lotta-love/right.mp4':
            existing['videoFileRight'] = restored['videoFileRight']
        old_durations = {1: 16.5, 2: 16, 6: 16, 7: 16}
        if existing.get('duration') == old_durations.get(existing.get('id')):
            existing['duration'] = restored['duration']
        if restored.get('dna') and not existing.get('dna'):
            bounds = lambda riff: [(s.get('start'), s.get('end')) for s in riff.get('segments', [])]
            if bounds(existing) != bounds(restored):
                raise ValueError('Black Dog timings have changed; DNA links need manual reconciliation')
            existing['dna'] = copy.deepcopy(restored['dna'])
            for seg, annotation in zip(existing['segments'], restored['segments']):
                for key, value in annotation.items():
                    seg.setdefault(key, copy.deepcopy(value))
    return result


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    stat = path.stat() if path.exists() else None
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.riff-recovery-')
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
        os.chmod(name, stat.st_mode & 0o777 if stat else 0o644)
        if stat and (stat.st_uid != os.getuid() or stat.st_gid != os.getgid()):
            os.chown(name, stat.st_uid, stat.st_gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run(args):
    source = Path(__file__).resolve().parents[1]
    target = args.site_root.resolve()
    if target == source:
        raise ValueError('Use a separate target; do not deploy over the release checkout')
    plan = json.loads((source / 'tools/recovery-plan.json').read_text())
    pending = {}
    for relative, hashes in plan['files'].items():
        release = (source / relative).read_bytes()
        if digest(release) != hashes['after']:
            raise ValueError('Release file does not match verified plan: ' + relative)
        dest = target / relative
        current = digest(dest.read_bytes()) if dest.is_file() else None
        if current == hashes['after']:
            continue
        if current != hashes['before']:
            raise ValueError('Server file changed; refusing to overwrite: ' + relative)
        pending[relative] = release
    with ZipFile(args.archive) as archive:
        for relative, metadata in plan['media'].items():
            dest = target / relative
            if dest.exists():
                if digest(dest.read_bytes()) != metadata['sha256']:
                    raise ValueError('Existing media differs; refusing to replace: ' + relative)
                continue
            data = archive.read('riffkiller/' + relative)
            if len(data) != metadata['size'] or digest(data) != metadata['sha256']:
                raise ValueError('Recovery media checksum mismatch: ' + relative)
            pending[relative] = data
    catalog_path = target / 'data/riffs.json'
    current = json.loads(catalog_path.read_text())
    merged = merge_catalog(current, json.loads((source / 'data/riffs.json').read_text()))
    if current != merged:
        pending['data/riffs.json'] = (json.dumps(merged, ensure_ascii=False, indent=4) + '\n').encode()
    for relative in pending:
        print(('UPDATE ' if (target / relative).exists() else 'RESTORE ') + relative)
    if not args.apply:
        print(f'Preflight passed: {len(pending)} files. No changes made. Review before using --apply.')
        return
    if not pending:
        print('Release already installed; nothing to change.')
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = target.parent / (target.name + '-recovery-backup-' + stamp)
    for relative in pending:
        dest = target / relative
        if dest.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, saved)
    completed = []
    try:
        for relative, data in pending.items():
            atomic_write(target / relative, data)
            completed.append(relative)
    except Exception:
        for relative in reversed(completed):
            saved = backup / relative
            if saved.exists():
                atomic_write(target / relative, saved.read_bytes())
            else:
                (target / relative).unlink()
        raise
    print('Installed. Backup: ' + str(backup))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    try:
        run(parser.parse_args())
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, str(error) + '\n')
