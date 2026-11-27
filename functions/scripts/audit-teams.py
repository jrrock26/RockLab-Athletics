#!/usr/bin/env python3
"""Audit teams for schema drift: missing schoolId, sportId, headCoachId."""
import json, urllib.request

TOKEN = None
import subprocess
cfg = json.load(open('/Users/jasonrock/.config/configstore/firebase-tools.json'))
TOKEN = cfg['tokens']['access_token']

url = 'https://firestore.googleapis.com/v1/projects/rocklab-athletics/databases/(default)/documents/teams?pageSize=500'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
with urllib.request.urlopen(req, timeout=30) as resp:
    d = json.load(resp)

docs = d.get('documents', [])
print(f'Total teams returned: {len(docs)}')
missing_school = 0
missing_sport = 0
missing_coach = 0
missing_all = 0

for doc in docs:
    f = doc.get('fields', {})
    missing = []
    if 'schoolId' not in f or not f['schoolId'].get('stringValue'):
        missing.append('schoolId')
    if 'sportId' not in f or not f['sportId'].get('stringValue'):
        missing.append('sportId')
    if 'headCoachId' not in f or not f['headCoachId'].get('stringValue'):
        missing.append('headCoachId')
    if len(missing) == 3:
        missing_all += 1
    if 'schoolId' in missing:
        missing_school += 1
    if 'sportId' in missing:
        missing_sport += 1
    if 'headCoachId' in missing:
        missing_coach += 1
    if missing:
        tid = doc['name'].split('/')[-1]
        print(f'  TEAM {tid}: missing [{",".join(missing)}] | fields: {list(f.keys())}')

print(f'\n--- Summary ---')
print(f'Missing schoolId: {missing_school}')
print(f'Missing sportId: {missing_sport}')
print(f'Missing headCoachId: {missing_coach}')
print(f'Missing all three: {missing_all}')

# Also list schools
url2 = 'https://firestore.googleapis.com/v1/projects/rocklab-athletics/databases/(default)/documents/schools?pageSize=100'
req2 = urllib.request.Request(url2, headers={'Authorization': f'Bearer {TOKEN}'})
with urllib.request.urlopen(req2, timeout=30) as resp2:
    d2 = json.load(resp2)
sdocs = d2.get('documents', [])
print(f'\nTotal schools: {len(sdocs)}')
for doc in sdocs:
    f = doc.get('fields', {})
    sid = doc['name'].split('/')[-1]
    name = f.get('name', {}).get('stringValue', '?')
    ad = f.get('adUserId', {}).get('stringValue', '?')
    district = f.get('district', {}).get('stringValue', '?')
    print(f'  SCHOOL {sid}: name="{name}" adUserId="{ad}" district="{district}"')