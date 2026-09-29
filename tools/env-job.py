# writes .scratch/raw/env-job.json from what is in .scratch/ph: per-prop triangle and texture budgets (run from the project root)
import json, os, sys
ph = '.scratch/ph'
BIG = {'modular_electricity_poles': (16000, 512), 'exterior_aircon_unit': (5000, 512), 'rollershutter_door': (2000, 512), 'rollershutter_window_01': (2000, 512), 'concrete_road_barrier': (3000, 512), 'metal_trash_can': (4000, 512), 'modular_electric_cables': (4000, 256), 'street_lamp_01': (5000, 256), 'street_lamp_02': (5000, 256), 'modular_chainlink_fence': (4000, 512), 'WoodenTable_01': (3000, 512), 'dead_tree_trunk': (8000, 512), 'dead_tree_trunk_02': (8000, 512), 'root_cluster_01': (10000, 512), 'root_cluster_02': (10000, 512), 'pine_roots': (8000, 512), 'island_tree_01': (12000, 512), 'island_tree_02': (12000, 512), 'rock_moss_set_01': (8000, 512), 'tree_stump_01': (5000, 512), 'mounted_fluorescent_lights': (3000, 256), 'hanging_industrial_lamp': (3000, 256)}
SPLIT = {'rock_moss_set_01', 'shrub_02', 'grass_medium_01', 'anthurium_botany_01', 'periwinkle_plant', 'fern_02'}
FRUIT = {'bananas', 'food_apple_01', 'food_avocado_01', 'food_ginger_01', 'food_lime_01', 'food_lychee_01', 'food_pomegranate_01', 'lemon', 'sweet_potato', 'yellow_onion'}
SKIP = {'modular_electricity_poles', 'modular_electric_cables'}
props, textures, skies = [], [], []
for d in sorted(os.listdir(ph)):
    g = f'{ph}/{d}/{d}.gltf'
    if d in SKIP: continue
    if os.path.exists(g):
        j = json.load(open(g)); uris = [b['uri'] for b in j.get('buffers', [])] + [i['uri'] for i in j.get('images', [])]
        if all(os.path.exists(f'{ph}/{d}/{u}') for u in uris):
            t, x = BIG.get(d, (1500, 128) if d in FRUIT else (3500, 256)); props.append({'id': d, 'tris': t, 'tex': x, **({'split': True} if d in SPLIT else {})})
    elif os.path.exists(f'{ph}/{d}/diff.jpg') or os.path.exists(f'{ph}/{d}/diff.png'): textures.append({'id': d, 'size': 1024})
    elif os.path.exists(f'{ph}/{d}/{d}_1k.hdr'): skies.append({'id': d, 'w': 512})
only = sys.argv[1:] if len(sys.argv) > 1 else None
if only: props = [p for p in props if p['id'] in only]
json.dump({'dir': '/.scratch/ph/', 'props': props, 'textures': textures, 'skies': skies}, open('.scratch/raw/env-job.json', 'w'))
print(len(props), 'props', len(textures), 'textures', len(skies), 'skies')
