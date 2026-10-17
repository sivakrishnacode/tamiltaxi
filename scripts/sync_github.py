#!/usr/bin/env python3
"""Mirrors two files on GitHub. docs/RELEASES.md: a release (and its tag) for every entry with a `Release:` line.
docs/ROADMAP.md: a milestone per `##` section (except Backlog) and an issue per `###` item (title, milestone, labels,
closed when `Status: done`; the text only when it's created). Plus the planning labels. Run by
.github/workflows/github-sync.yml on every push to main that changes them. Safe to run again: it creates what's
missing and updates the rest; it never reopens an issue or removes a label someone added on GitHub.

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
RELEASES = ROOT / 'docs' / 'RELEASES.md'
ROADMAP = ROOT / 'docs' / 'ROADMAP.md'

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
META = re.compile(r'^(Issue|Labels|Status):')
# A relative link in docs/ (not http(s), not #anchor), made absolute for issue text.
RELATIVE_LINK = re.compile(r'\]\((?!https?://|#)([^)]+)\)')


def plain(text):
    return text.replace('`', '').strip()


def parse_releases(text):
    """Releases (tag, sha, title, body): every `###` entry with a `Release:` line, titled after its `##` section."""
    releases = []
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
    if heading is not None:
        flush()
    return releases


def parse_roadmap(text):
    """(milestones, items): milestones are [title, description]; items are dicts (title, milestone, number, labels,
    done, body)."""
    milestones, items = [], []
    milestone, item = None, None

    def close():
        if item is not None:
            item['body'] = '\n'.join(item.pop('lines')).strip()
            items.append(item)

    for line in text.splitlines():
        if line.startswith('## ') or line.startswith('---'):
            close()
            item = None
            if line.startswith('## '):
                name = plain(line[3:])
                milestone = None if name == 'Backlog' else name
                if milestone:
                    milestones.append([milestone, ''])
        elif line.startswith('### '):
            close()
            item = {'title': line[4:].strip(), 'milestone': milestone, 'number': None, 'labels': [], 'done': False,
                    'lines': [], 'meta': False}
        elif item is None:
            if milestone and line.startswith('> ') and not milestones[-1][1]:
                milestones[-1][1] = line[2:].strip()
        elif not item['meta'] and META.match(line):
            item['meta'] = True
            for part in line.split(' · '):
                key, _, value = part.partition(':')
                value = value.strip()
                if key == 'Issue':
                    item['number'] = int(value.lstrip('#'))
                elif key == 'Labels':
                    item['labels'] = [x.strip() for x in value.split(',') if x.strip()]
                elif key == 'Status':
                    item['done'] = value.lower() == 'done'
        else:
            item['lines'].append(line)
    close()
    for it in items:
        it.pop('meta')
    return milestones, items


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


def sync_issues(repo, items):
    issues = json.loads(run('gh', 'issue', 'list', '--state', 'all', '--limit', '1000', '--json',
                            'number,title,state,milestone,labels'))
    by_number = {i['number']: i for i in issues}
    by_title = {i['title']: i for i in issues}
    roadmap = f'https://github.com/{repo}/blob/main/docs/ROADMAP.md'
    for it in items:
        cur = by_number.get(it['number']) or by_title.get(it['title'])
        if cur is None:
            if it['done']:
                continue
            body = RELATIVE_LINK.sub(lambda m: f'](https://github.com/{repo}/blob/main/docs/{m[1]})', it['body'])
            with tempfile.NamedTemporaryFile('w', suffix='.md', delete=False) as text:
                text.write(f'{body}\n\n---\nPlanned in [docs/ROADMAP.md]({roadmap}).\n')
            args = ['gh', 'issue', 'create', '--title', it['title'], '--body-file', text.name]
            if it['milestone']:
                args += ['--milestone', it['milestone']]
            if it['labels']:
                args += ['--label', ','.join(it['labels'])]
            print(f'issue created: {run(*args).strip()} {it["title"]}')
            os.unlink(text.name)
            continue
        number, args = str(cur['number']), []
        if cur['title'] != it['title']:
            args += ['--title', it['title']]
        if (cur.get('milestone') or {}).get('title') != it['milestone']:
            args += ['--milestone', it['milestone']] if it['milestone'] else ['--remove-milestone']
        have = {label['name'] for label in cur['labels']}
        missing = [label for label in it['labels'] if label not in have]
        if missing:
            args += ['--add-label', ','.join(missing)]
        if args:
            run('gh', 'issue', 'edit', number, *args)
            print(f'issue #{number}: updated ({" ".join(a for a in args if a.startswith("--"))})')
        if it['done'] and cur['state'] == 'OPEN':
            run('gh', 'issue', 'close', number, '--reason', 'completed')
            print(f'issue #{number}: closed')


def main():
    releases = parse_releases(RELEASES.read_text())
    milestones, items = parse_roadmap(ROADMAP.read_text())
    if '--dry-run' in sys.argv:
        for title, text in milestones:
            print(f'milestone {title}: {text}')
        for r in releases:
            print(f'release {r["tag"]} at {r["sha"]}{" (pre-release)" if prerelease(r["tag"]) else ""}: {r["title"]}')
        for it in items:
            print(f'issue {"#" + str(it["number"]) if it["number"] else "(new)"} [{it["milestone"] or "no milestone"}] '
                  f'{",".join(it["labels"])}{" DONE" if it["done"] else ""}: {it["title"]} ({len(it["body"])} chars)')
        return
    repo = os.environ['GITHUB_REPOSITORY']
    sync_labels()
    sync_milestones(repo, milestones)
    sync_releases(repo, releases)
    sync_issues(repo, items)


if __name__ == '__main__':
    main()
