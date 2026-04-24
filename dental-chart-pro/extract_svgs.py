import re, json

# Read the SVG
with open(r'c:\Clinic system project\dental-chart-pro\src\assets\svg\ortho-chart-v2.svg', 'r', encoding='utf-8') as f:
    svg = f.read()

def extract_inner(svg, group_id):
    """Extract inner content of <g id="..."> ... </g>"""
    pattern = f'id="{group_id}">'
    start = svg.find(pattern)
    if start == -1:
        return None
    content_start = start + len(pattern)
    depth = 1
    i = content_start
    while i < len(svg) and depth > 0:
        next_open = svg.find('<g', i)
        next_close = svg.find('</g>', i)
        if next_close == -1:
            break
        if next_open != -1 and next_open < next_close:
            depth += 1
            i = next_open + 2
        else:
            depth -= 1
            if depth == 0:
                return svg[content_start:next_close]
            i = next_close + 4
    return None

ids = {
    '17': ['tooth_17_band', 'tooth_17_tube'],
    '27': ['tooth_27_band', 'tooth_27_tube'],
    '37': ['tooth_37_band', 'tooth_37_tube'],
    '47': ['tooth_47_band', 'tooth_47_tube'],
}

results = {}
for tid, (band_id, tube_id) in ids.items():
    band = extract_inner(svg, band_id)
    tube = extract_inner(svg, tube_id)
    results[tid] = {
        'band': band,
        'tube': tube,
        'band_len': len(band) if band else 0,
        'tube_len': len(tube) if tube else 0,
    }
    print(f"Tooth {tid}: band={'OK' if band else 'MISSING'}({results[tid]['band_len']}), tube={'OK' if tube else 'MISSING'}({results[tid]['tube_len']})")

# Save results for next step
with open(r'c:\Clinic system project\dental-chart-pro\extracted_svgs.json', 'w', encoding='utf-8') as f:
    json.dump({tid: {'band': v['band'], 'tube': v['tube']} for tid, v in results.items()}, f, ensure_ascii=False)

print('Saved to extracted_svgs.json')
