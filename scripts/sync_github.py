#!/usr/bin/env python3
"""Mirrors docs/RELEASES.md on GitHub: a release (and its tag) for every entry with a `Release:` line, the
milestones in its Milestones table, and the planning labels. Run by .github/workflows/releases.yml on every push to
main that changes the file. Safe to run again: it creates what's missing and updates the rest.

  python3 scripts/sync_github.py --dry-run   # print what it would do (no gh, no network)
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / 'docs' / 'RELEASES.md'

# name: (colour, description)
LABELS = {
    'rider': ('d93f0b', 'Tamil Taxi rider app (apps/passenger)'),
    'driver': ('1d76db', 'Tamil Taxi Driver app (apps/driver)'),
    'api': ('5319e7', 'NestJS API (apps/api)'),
    'admin': ('0e8a16', 'Admin panel (apps/admin)'),
    'web': ('c5def5', 'Public website (apps/web)'),
    'infra': ('6f42c1', 'Servers, AWS, Google Cloud, CI'),
    'release': ('fbca04', 'Shipping a version to Google Play'),
    'launch': ('b60205', 'Needed for the production launch'),
    'plan': ('bfdadc', 'Planned, not started'),
}

RELEASE_LINE = re.compile(r'^Release: `([^`]+)` at `([0-9a-f]{7,40})`\s*$')


def plain(text):
    return text.replace('`', '').strip()


def parse(text):
    """(releases, milestones) from the file: releases are dicts (tag, sha, title, body), milestones (title, text)."""
    releases, milestones = [], []
    section, heading, block = None, None, []

    def flush():
        for i, line in enumerate(block):
            m = RELEASE_LINE.match(line)
            if m:
                body = '\n'.join(block[:i] + block[i + 1:]).strip()
                releases.append({'tag': m[1], 'sha': m[2], 'title': f'{section} {plain(heading)}', 'body': body})

    for line in text.splitlines():
        if line.startswith('## ') or line.startswith('### ') or line.startswith('---'):
            if heading is not None:
                flush()
            heading, block = (line[4:], []) if line.startswith('### ') else (None, [])
            if line.startswith('## '):
                section = plain(line[3:]).split(' · ')[0]
        elif heading is not None:
            block.append(line)
        elif section == 'Milestones' and line.startswith('|') and not set(line) <= set('|-: '):
            cells = [plain(c) for c in line.strip().strip('|').split('|')]
            if cells[0] != 'Milestone':
                milestones.append((cells[0], cells[1]))
    if heading is not None:
        flush()
    return releases, milestones


def prerelease(tag):
    return tag.startswith('staging-') or re.search(r'-v0\.', tag) is not None


def run(*args, cwd=ROOT):
    return subprocess.run(args, check=True, capture_output=True, text=True, cwd=cwd).stdout


def commit(sha):
    """Full hash and commit time of [sha]."""
    full, when = run('git', 'log', '-1', '--format=%H %ct', sha).split()
    return full, int(when)


def sync_labels():
    for name, (colour, description) in LABELS.items():
        run('gh', 'label', 'create', name, '--color', colour, '--description', description, '--force')
    print(f'labels: {", ".join(LABELS)}')


def sync_milestones(repo, milestones):
    have = {m['title']: m for m in json.loads(run('gh', 'api', f'repos/{repo}/milestones?state=all&per_page=100'))}
    for title, text in milestones:
        m = have.get(title)
        if m is None:
            m = json.loads(run('gh', 'api', f'repos/{repo}/milestones', '-f', f'title={title}', '-f', f'description={text}'))
            print(f'milestone #{m["number"]} {title}: created')
        elif (m.get('description') or '') != text:
            run('gh', 'api', '-X', 'PATCH', f'repos/{repo}/milestones/{m["number"]}', '-f', f'description={text}')
            print(f'milestone #{m["number"]} {title}: updated')
        else:
            print(f'milestone #{m["number"]} {title}: unchanged')


def sync_releases(repo, releases):
    existing = {r['tagName'] for r in json.loads(run('gh', 'release', 'list', '--limit', '1000', '--json', 'tagName'))}
    link = f'https://github.com/{repo}/blob/main/docs/RELEASES.md'
    # Oldest first, so GitHub lists them in the order they happened.
    for r in sorted(releases, key=lambda r: commit(r['sha'])[1]):
        full, _ = commit(r['sha'])
        with tempfile.NamedTemporaryFile('w', suffix='.md', delete=False) as notes:
            notes.write(f'{r["body"]}\n\n---\nRecorded in [docs/RELEASES.md]({link}).\n')
        pre = prerelease(r['tag'])
        if r['tag'] in existing:
            run('gh', 'release', 'edit', r['tag'], '--title', r['title'], '--notes-file', notes.name,
                f'--prerelease={str(pre).lower()}')
            print(f'release {r["tag"]}: updated')
        else:
            run('gh', 'release', 'create', r['tag'], '--target', full, '--title', r['title'],
                '--notes-file', notes.name, *(['--prerelease'] if pre else []))
            print(f'release {r["tag"]}: created at {full[:7]}')
        os.unlink(notes.name)


def main():
    releases, milestones = parse(DOC.read_text())
    if '--dry-run' in sys.argv:
        for title, text in milestones:
            print(f'milestone {title}: {text}')
        for r in releases:
            print(f'release {r["tag"]} at {r["sha"]}{" (pre-release)" if prerelease(r["tag"]) else ""}: {r["title"]}')
        return
    repo = os.environ['GITHUB_REPOSITORY']
    sync_labels()
    sync_milestones(repo, milestones)
    sync_releases(repo, releases)


if __name__ == '__main__':
    main()
