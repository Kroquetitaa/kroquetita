"""Connect the original bridge to the observatory edge, preserving every district.

Runs only in a background Blender process. Does not touch the user's open document.
"""
import bpy, sys, math, json, shutil
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from kit import subtree
from export_city import rest_transforms, finalize

BACKUP = HERE / 'backups' / 'before-native-bridge-fix'
BACKUP.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

def resize_axis(obj, axis, length):
    if obj.data.users > 1: obj.data = obj.data.copy()
    values = [vertex.co[axis] for vertex in obj.data.vertices]
    factor = length / (max(values) - min(values))
    for vertex in obj.data.vertices: vertex.co[axis] *= factor
    obj.data.update()

def repair():
    bridge = bpy.data.objects['Brain bridge']
    angle = math.atan2(4.5, 7)
    # Top face, rather than the middle of its thickness, meets both platforms.
    bridge.location = (0, 15.5 + math.sin(angle) * .11, 2.25 - math.cos(angle) * .11)
    bridge.rotation_euler = (angle, 0, 0)
    resize_axis(bridge, 1, math.hypot(7, 4.5))
    for rail in [obj for obj in bpy.data.objects if obj.name.startswith('Bridge handrail')]:
        x = rail.location.x
        start, end = Vector((x, 12, 1)), Vector((x, 19, 5.5))
        resize_axis(rail, 2, (end-start).length)
        rail.location = (start+end) / 2
        rail.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    bpy.context.view_layer.update()

files = ['kroquetita-city.blend', 'kroquetita-city-cycle.blend', 'kroquetita-city-day.blend',
         'kroquetita-city-golden.blend', 'kroquetita-city-night.blend', 'districts/transport.blend']
if 'district-only' in sys.argv: files = ['districts/transport.blend']
for filename in files:
    path = HERE / filename
    backup = BACKUP / filename.replace('/', '__')
    if not backup.exists(): shutil.copy2(path, backup)
    bpy.ops.wm.open_mainfile(filepath=str(path))
    if filename.startswith('districts/'):
        preview = next(scene for scene in bpy.data.scenes if 'transport_Root' in scene.objects)
        bpy.context.window.scene = preview
        preview.frame_set(150)
    repair()
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    if filename == 'kroquetita-city.blend':
        bpy.context.scene.frame_set(150)
        root = bpy.data.objects['transport_Root']
        objects = list(subtree(root)); rest = rest_transforms(objects)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        exported = HERE / 'exports' / 'transport.glb'
        source_backup = BACKUP / 'transport.glb'
        if not source_backup.exists(): shutil.copy2(exported, source_backup)
        bpy.ops.export_scene.gltf(filepath=str(exported), export_format='GLB', use_selection=True,
            export_apply=True, export_yup=True, export_lights=False, export_cameras=False,
            export_extras=True, export_animations=True, export_animation_mode='NLA_TRACKS',
            export_frame_range=False, export_force_sampling=True, export_materials='EXPORT')
        record = finalize(exported, rest, root)
        record.update(assembly_position_blender=[0,0,0], assembly_position_gltf=[0,0,0], assembly_parent=None)
        manifest_path = HERE / 'exports' / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf8'))
        manifest['assets']['transport'] = record
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf8')
print('NATIVE_BRIDGE_REPAIRED_IN_ALL_SAVED_SCENES', flush=True)
