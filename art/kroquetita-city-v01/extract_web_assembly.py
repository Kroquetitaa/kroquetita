"""Read the authored city frame without changing it; expose exact Y-up assembly."""
import bpy, json, math, sys, hashlib
from pathlib import Path
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
source_name = 'kroquetita-city-cycle.blend' if 'cycle-reference' in sys.argv else 'kroquetita-city.blend'
bpy.ops.wm.open_mainfile(filepath=str(HERE / source_name))
bpy.context.scene.frame_set(150)
bpy.context.view_layer.update()
C = Matrix.Rotation(-math.pi / 2, 4, 'X')

def transform(obj):
    matrix = C @ obj.matrix_world @ C.inverted()
    position, quaternion, scale = matrix.decompose()
    return {'position': list(position), 'quaternion': [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
            'scale': list(scale), 'matrix': [matrix[r][c] for c in range(4) for r in range(4)]}

def bounds(objects):
    points = [C @ obj.matrix_world @ Vector(v) for obj in objects if obj.type in ('MESH', 'FONT', 'CURVE') for v in obj.bound_box]
    return {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)]} if points else None

def descendants(obj):
    yield obj
    for child in obj.children: yield from descendants(child)

names = ['transport', 'plaza', 'career', 'library', 'bugs', 'hangar', 'lab', 'factory', 'brain_inside']
roots = {}
for name in names:
    root = bpy.data.objects[name + '_Root']
    roots[name] = {**transform(root), 'root': root.name, 'bounds': bounds(list(descendants(root)))}
    signature = hashlib.sha256()
    for obj in sorted(descendants(root), key=lambda obj: obj.name):
        signature.update(obj.name.encode())
        if not obj.animation_data:
            signature.update(json.dumps([round(v, 7) for row in obj.matrix_basis for v in row]).encode())
        if obj.type == 'MESH':
            signature.update(json.dumps([[round(v, 7) for v in vertex.co] for vertex in obj.data.vertices]).encode())
    roots[name]['staticGeometryHash'] = signature.hexdigest()
standalone = {name: transform(bpy.data.objects[root]) for name, root in [('avatar', 'AvatarRoot'), ('coffee_machine', 'CoffeeRoot')]}
camera = bpy.data.objects['CAM / Ciudad']
forward = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
camera_matrix = C @ camera.matrix_world
camera_position, camera_quaternion, camera_scale = camera_matrix.decompose()
camera_data = {'position': list(camera_position), 'quaternion': [camera_quaternion.x, camera_quaternion.y, camera_quaternion.z, camera_quaternion.w],
               'type': camera.data.type, 'orthoScale': camera.data.ortho_scale,
               'target': list(C @ (camera.matrix_world.translation + forward * 100)), 'lens': camera.data.lens}
data = {'version': 2, 'source': source_name, 'restFrame': 150, 'up': '+Y',
        'districts': roots, 'standalone': standalone, 'camera': camera_data}
output_name = 'native-assembly-cycle.json' if 'cycle-reference' in sys.argv else 'native-assembly.json'
(HERE / 'exports' / output_name).write_text(json.dumps(data, indent=2), encoding='utf8')
print('NATIVE_ASSEMBLY_EXTRACTED', flush=True)
