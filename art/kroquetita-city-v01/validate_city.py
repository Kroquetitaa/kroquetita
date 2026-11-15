"""Open every native district and round-trip the exported GLBs in Blender."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
manifest=json.loads((HERE/'exports'/'manifest.json').read_text(encoding='utf-8'))
report={'native':{},'glb':{}}
for name,entry in manifest['assets'].items():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/'districts'/(name+'.blend')))
    s=bpy.context.scene;s.frame_set(150)
    meshes=[o for o in s.objects if o.type=='MESH']
    assert meshes and bpy.data.objects.get(entry['root']),name
    assert len(meshes)==entry['mesh_objects'],(name,len(meshes),entry['mesh_objects'])
    report['native'][name]={'scene':s.name,'mesh_objects':len(meshes),'opened':True}
for name,entry in manifest['assets'].items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(HERE/'exports'/entry['file']))
    s=bpy.context.scene;s.frame_set(150)
    meshes=[o for o in s.objects if o.type=='MESH']
    assert len(meshes)==entry['mesh_objects'],name
    points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    assert all(math.isfinite(x) for v in points for x in v)
    size=[round(max(p[i] for p in points)-min(p[i] for p in points),4) for i in range(3)]
    assert all(x>0 for x in size),name
    report['glb'][name]={'imported':True,'mesh_objects':len(meshes),'bounds_blender_xyz':size}
bpy.ops.wm.open_mainfile(filepath=str(HERE/'kroquetita-city-cycle.blend'))
s=bpy.context.scene;values={}
for f in (300,660,1020,1740):
    s.frame_set(f)
    values[str(f)]={'sun_energy':bpy.data.objects['Sun'].data.energy,
       'background_strength':s.world.node_tree.nodes['Background'].inputs['Strength'].default_value}
assert values['300']['sun_energy']>values['1020']['sun_energy']*10
report['lighting_cycle']=values
report['status']='passed'
(HERE/'qa.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('KQ_QA_PASSED',flush=True)
