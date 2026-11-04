import json

with open('data/schedule.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

venues = data['venues']
movies = data['movies']

print(f"=== VENUES ({len(venues)}) ===")
for v in venues:
    print(f"  {v['id']}: {v['name']} ({v['location']}) - {v['status']} [{v['sourceName']}]")

print(f"\n=== MOVIES ({len(movies)}) ===")
bogus_titles = ["14+", "18+", "V.M.18", "V.O. SOTT.", "#ANTEPRIMA", "VM18"]

for m in movies:
    t = m['title']
    for b in bogus_titles:
        assert b != t, f"BOGUS TITLE FOUND: {t}"
    
    venues_for_movie = sorted(list(set(s['venue'] for s in m['shows'])))
    dates = sorted(list(set(s['date'] for s in m['shows'])))
    total_shows = sum(len(s['shows']) for s in m['shows'])
    
    print(f"ID {m['id']:>2} | '{t:<35}' | Venues ({len(venues_for_movie)}): {venues_for_movie} | Shows: {total_shows:>2} | Dates: {len(dates)}")

print("\nALL VERIFICATIONS PASSED! 0 BOGUS TITLES FOUND.")
