"""Apply reviewed geometry fixes and save a separate animated day/night scene."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from build_city import lighting,configure_view
bpy.ops.wm.open_mainfile(filepath=str(HERE/'kroquetita-city.blend'))
s=bpy.context.scene
bpy.context.preferences.filepaths.save_version=0
for obj in s.objects:
    if obj.name.startswith(('Glossy avenue','Glossy east west street')): obj.location.z=-.10
if 'Drone_FlightHeight' not in bpy.data.objects:
    flight=bpy.data.objects.new('Drone_FlightHeight',None)
    bpy.data.collections['transport'].objects.link(flight)
    flight.parent=bpy.data.objects['transport_Root'];flight.location=(0,0,1.2)
    bpy.data.objects['Drone_Idle'].parent=flight
s.camera=bpy.data.objects['CAM / Ciudad']; s.camera.data.ortho_scale=85
s.frame_set(150); configure_view(s)
for mode in ('day','golden','night'):
    lighting(s,mode)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f'kroquetita-city-{mode}.blend'),compress=True)
lighting(s,'golden')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kroquetita-city.blend'),compress=True)
# Independent preview scene; static presets and web export source retain no
# lighting keyframes. Start at 300 so all career towers are fully grown.
for f,mode in [(300,'day'),(660,'golden'),(1020,'night'),(1380,'golden'),(1740,'day')]:
    lighting(s,mode)
    sun=bpy.data.objects['Sun']; sun.keyframe_insert(data_path='rotation_euler',frame=f)
    for obj in s.objects:
        if obj.type=='LIGHT':
            obj.data.keyframe_insert(data_path='energy',frame=f)
            obj.data.keyframe_insert(data_path='color',frame=f)
    bg=s.world.node_tree.nodes.get('Background')
    for socket in ('Color','Strength'): bg.inputs[socket].keyframe_insert(data_path='default_value',frame=f)
    for key in ('light','warm'):
        node=bpy.data.materials['CITY / '+key].node_tree.nodes.get('Principled BSDF')
        node.inputs['Emission Strength'].keyframe_insert(data_path='default_value',frame=f)
for obj in s.objects:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:
            if track.name in ('Idle','Monorail_Loop','Drone_Hover','Factory_Conveyor'):
                for strip in track.strips: strip.repeat=30
s.frame_start=300;s.frame_end=1740;s.frame_set(660)
s['Day/night cycle']='60 seconds, frames 300-1740 at 24 fps. Space to play.'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kroquetita-city-cycle.blend'),compress=True)
print('KQ_REFINED_AND_CYCLE_SAVED',flush=True)
