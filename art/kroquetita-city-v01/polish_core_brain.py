"""Rebuild the complete raised CORE lookout in saved native scenes, with backups.

Run with Blender --background --threads 4 --factory-startup --python this_file.
The user's open Blender document is never loaded or controlled by this process.
"""
import bpy, sys, json, shutil, hashlib
from pathlib import Path
from mathutils import Matrix

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import Kit, subtree, material, camera, light, cube
from district_career_brain import _core_lookout, CORE_LIFT
from export_city import rest_transforms, finalize

BACKUP=HERE/'backups'/'before-core-lift-20261115'
BACKUP.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
PREFIXES=('Career_Hemisphere_','Career_Cortex_','Career_Synapse_',
          'Career_Brain','Career_CorePulse','Career_CorpusCallosum','Career_Gyrus',
          'Career_CoreName','Career_CoreSign','Hook_Career_BrainPortal','Hook_Career_CoreFocus')
PREFIXES += ('Career_CoreDeck','Career_CoreUnderlight','Career_CoreStrut_',
             'Career_CoreSideRail_','Career_CoreBackRail','Hook_Career_Lookout')

def is_replaced(obj):
    return obj.name.startswith(PREFIXES)

def unchanged_signature(root):
    signature=hashlib.sha256()
    for obj in sorted(subtree(root),key=lambda item:item.name):
        if is_replaced(obj):continue
        signature.update(obj.name.encode())
        signature.update(json.dumps([round(v,7) for row in obj.matrix_basis for v in row]).encode())
        if obj.type=='MESH':
            signature.update(json.dumps([[round(v,7) for v in vertex.co] for vertex in obj.data.vertices]).encode())
    return signature.hexdigest()

def polish():
    root=bpy.data.objects['career_Root']
    original=unchanged_signature(root)
    for obj in list(subtree(root)):
        if is_replaced(obj):bpy.data.objects.remove(obj,do_unlink=True)
    kit=Kit.__new__(Kit);kit.name='career';kit.root=root
    kit.col=next(c for c in root.users_collection if c in tuple(bpy.context.scene.collection.children_recursive))
    kit.mats={mat.name[len('CITY / '):]:mat for mat in bpy.data.materials if mat.name.startswith('CITY / ')}
    _core_lookout(kit,[])
    bpy.context.view_layer.update()
    assert unchanged_signature(root)==original,'Unexpected change outside exterior brain and sign'
    assert tuple(round(v,3) for v in bpy.data.objects['Hook_Career_CoreFocus'].location)==(0,2.15,round(8.02+CORE_LIFT,3))
    return root

files=['kroquetita-city.blend','kroquetita-city-cycle.blend','kroquetita-city-day.blend',
       'kroquetita-city-golden.blend','kroquetita-city-night.blend','districts/career.blend']
preview_only='preview-only' in sys.argv
if preview_only:files=['districts/career.blend']
report=[]
for filename in files:
    path=HERE/filename;backup=BACKUP/filename.replace('/','__')
    if not backup.exists():shutil.copy2(path,backup)
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene=next(scene for scene in bpy.data.scenes if 'career_Root' in scene.objects)
    bpy.context.window.scene=scene
    authored_frame=scene.frame_current
    scene.frame_set(150)
    root=polish()
    scene.frame_set(authored_frame)
    if not preview_only:bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    report.append({'source':filename,'unchangedDistrictGeometry':True,'brainFocus':[0,2.15,8.02+CORE_LIFT],'coreLift':CORE_LIFT})
    if filename=='kroquetita-city.blend':
        scene.frame_set(150)
        old_parent=root.parent;old_basis=root.matrix_basis.copy()
        root.parent=None;root.matrix_basis=Matrix.Identity(4);bpy.context.view_layer.update()
        objects=list(subtree(root));rest=rest_transforms(objects)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        exported=HERE/'exports/career.glb'
        bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',use_selection=True,
            export_apply=True,export_yup=True,export_lights=False,export_cameras=False,
            export_extras=True,export_animations=True,export_animation_mode='NLA_TRACKS',
            export_frame_range=False,export_force_sampling=True,export_materials='EXPORT')
        record=finalize(exported,rest,root)
        record.update(assembly_position_blender=list(old_basis.translation),
            assembly_position_gltf=[old_basis.translation.x,old_basis.translation.z,-old_basis.translation.y],
            assembly_parent=old_parent.name if old_parent else None)
        manifest_path=HERE/'exports/manifest.json'
        manifest=json.loads(manifest_path.read_text(encoding='utf8'))
        manifest['assets']['career']=record
        manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf8')
        root.parent=old_parent;root.matrix_basis=old_basis
        print('CORE_BRAIN_EXPORTED '+json.dumps(record),flush=True)

if 'no-render' in sys.argv:
    print('CORE_BRAIN_POLISHED '+json.dumps(report),flush=True)
    raise SystemExit

# Render an isolated close-up from the saved district without changing that file.
root=bpy.data.objects['career_Root'];root.parent=None;root.matrix_basis=Matrix.Identity(4)
preview=bpy.data.scenes.new('CORE BRAIN / studio proof')
bpy.context.window.scene=preview
preview.world=bpy.data.worlds.new('CORE BRAIN / studio world');preview.world.use_nodes=True
preview.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.15,.25,1)
preview.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
model=bpy.data.collections.new('CORE BRAIN / model');preview.collection.children.link(model)
for obj in subtree(root):
    if obj==root or is_replaced(obj) or obj.name in ['Career_CoreDeck','Career_CoreUnderlight']:
        model.objects.link(obj)
studio=bpy.data.collections.new('CORE BRAIN / studio');preview.collection.children.link(studio)
cube('CORE BRAIN / ground',(0,1,5.80+CORE_LIFT),(200,200,.05),material('CORE BRAIN / backdrop','#62566f',.75),0,None,studio)
preview.camera=camera('CORE BRAIN / camera',(5,-9,11.0+CORE_LIFT),(0,1.8,7.55+CORE_LIFT),60,studio,ortho=4.8)
light('CORE BRAIN / key',(-4,-5,13+CORE_LIFT),(0,2,8+CORE_LIFT),900,(1,.85,.78),5,studio)
light('CORE BRAIN / fill',(5,-2,10+CORE_LIFT),(0,2,8+CORE_LIFT),650,(.77,.85,1),4,studio)
light('CORE BRAIN / rim',(1,6,12+CORE_LIFT),(0,2,8+CORE_LIFT),1000,(.83,.75,1),3,studio)
preview.render.engine='CYCLES';preview.cycles.samples=64;preview.cycles.use_denoising=True
preview.render.threads_mode='FIXED';preview.render.threads=4
preview.render.resolution_x=1200;preview.render.resolution_y=1200;preview.render.resolution_percentage=100
preview.view_settings.view_transform='AgX';preview.view_settings.look='AgX - Medium High Contrast'
preview.render.image_settings.file_format='PNG'
preview.render.filepath=str(HERE/'renderpreview/core-brain-polished.png')
bpy.ops.render.render(write_still=True)
print('CORE_BRAIN_POLISHED '+json.dumps(report),flush=True)
