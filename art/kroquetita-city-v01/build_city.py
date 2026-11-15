"""Build the modular city; run with Blender --background --python build_city.py."""
import bpy, sys, math, json, time
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import Kit, make_materials, material, light, camera, subtree, freeze_clip, PILOT
from district_hangar_plaza import build_plaza, build_hangar
from district_career_brain import build_career, build_brain
from district_factory_lab import build_factory, build_lab
from district_library_bugs import build_library, build_bugs

LAYOUT=[('plaza',build_plaza,(0,-1,0)),('career',build_career,(0,9,0)),
 ('library',build_library,(-17,8,0)),('bugs',build_bugs,(17,8,0)),
 ('hangar',build_hangar,(-17,-9,0)),('lab',build_lab,(0,-12,0)),
 ('factory',build_factory,(17,-9,0)),('brain_inside',build_brain,(0,24,4.5))]

def configure_view(scene):
    for screen in bpy.data.screens:
        for area in screen.areas:
            for s in area.spaces:
                if s.type=='VIEW_3D':
                    s.region_3d.view_perspective='CAMERA'
                    s.region_3d.view_camera_zoom=12
                    s.overlay.show_overlays=False
                    s.shading.type='MATERIAL'
                    s.shading.use_scene_lights=True
                    s.shading.use_scene_world=True

def checkpoint(scene, stage):
    scene['Construction stage']=stage
    scene.frame_set(150)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.update()
    configure_view(scene)
    path=HERE/'stages'/f'{stage:02d}.blend'
    path.parent.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    temp=HERE/'live-next.json'
    temp.write_text(json.dumps({'stage':stage,'path':str(path)}),encoding='utf-8')
    temp.replace(HERE/'live.json')
    print('KQ_STAGE',stage,'visible',flush=True)

def append_pilot(plaza):
    names=['02 / Coffee machine','03 / Kroquetita avatar']
    with bpy.data.libraries.load(str(PILOT/'kroquetita-plaza-v02.blend'),link=False) as (a,b):
        b.collections=names
    for col in b.collections:
        plaza.col.children.link(col)
    coffee=bpy.data.objects['CoffeeRoot']; avatar=bpy.data.objects['AvatarRoot']
    coffee.parent=plaza.root; coffee.location=(-4.7,-1.8,0)
    avatar.parent=plaza.root; avatar.location=(-2.2,-2,0)
    for obj in subtree(coffee):
        if obj.name.startswith('Body_back'):
            obj.location.z=1.25; obj.dimensions.z=1.76
    plaza.hook('Hook_Coffee',(-4.7,-2.6,1),'Coffee boost: preserve existing game logic')
    return coffee,avatar

def rail(k,name,points,radius,mat):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'
    data.bevel_depth=radius; data.bevel_resolution=2; data.resolution_u=1
    spline=data.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*co,1)
    spline.use_cyclic_u=True
    obj=bpy.data.objects.new(name,data); k.col.objects.link(obj)
    obj.parent=k.root; data.materials.append(k.m(mat))
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active=obj; bpy.ops.object.convert(target='MESH')

def transit(k,data):
    k.box('Floating city base',(0,3,-.65),(59,60,.85),'charcoal',.6)
    k.box('Reflecting lagoon',(0,3,-.18),(57.8,58.8,.16),'water',.35)
    for y in (-1,8,-9):
        k.box('Glossy east west street',(0,y,-.10),(47,1.9,.10),'wet',.05)
        for x in (-10,10):
            for d in (-.62,.62): k.box('Bridge light',(x,y+d,.025),(4,.035,.04),'light',.01)
    for x in (-17,0,17):
        k.box('Glossy avenue',(x,0,-.10),(1.8,34,.1),'wet',.05)
    bridge_angle=math.atan2(4.5,7)
    k.box('Brain bridge',(0,15.5+math.sin(bridge_angle)*.11,2.25-math.cos(bridge_angle)*.11),
          (1.9,math.hypot(7,4.5),.22),'purple',.05).rotation_euler.x=bridge_angle
    for x in (-.84,.84):
        k.link('Bridge handrail',(x,12,1.0),(x,19,5.5),.035,'light')
    for x in (-4,4):
        for y in (20,28): k.box('Observatory stilts',(x,y,1.8),(.3,.3,5.4),'metal',.035)
    for off,mat in [(-.26,'metal'),(.26,'metal'),(0,'light')]:
        pts=[((27+off)*math.cos(t),3+(29+off)*math.sin(t),3.4) for t in [i*2*math.pi/128 for i in range(128)]]
        rail(k,'Panoramic monorail '+mat,pts,.07 if off else .025,mat)
    for i in range(20):
        t=i*2*math.pi/20; x,y=27*math.cos(t),3+29*math.sin(t)
        k.box('Monorail pillar',(x,y,1.36),(.28,.28,4.0),'purple',.025)
        k.box('Pillar base',(x,y,-.17),(.74,.74,.18),'cream',.06)
    train=k.empty('Monorail_Train')
    k.box('Train chassis',(0,0,.24),(1.25,2.9,.42),'purple',.14,train)
    k.box('Train capsule',(0,0,.88),(1.19,2.75,.95),'cream',.21,train)
    k.box('Train front visor',(0,-1.34,.97),(.94,.12,.5),'glass',.08,train)
    for x in (-.606,.606):
        for y in (-.66,.25,.93): k.box('Passenger window',(x,y,1.0),(.035,.62,.48),'glass',.05,train)
    for x in (-.43,.43): k.ball('Train headlight',(x,-1.48,.51),.075,'warm',2,train)
    for i in range(97):
        t=-math.pi/2+i*2*math.pi/96
        train.location=(27*math.cos(t),3+29*math.sin(t),3.48)
        train.rotation_euler.z=t+math.pi
        train.keyframe_insert(data_path='location',frame=1+i*5)
        train.keyframe_insert(data_path='rotation_euler',frame=1+i*5)
    freeze_clip(train,'Monorail_Loop')
    for name,x,y in [('SUR',0,-26),('ESTE',27,3),('OESTE',-27,3),('NORTE',0,32)]:
        k.box('Station '+name,(x,y,3.22),(3.5,3.5,.25),'cream',.12)
        k.hook('Hook_Station_'+name,(x,y,3.5),'Board panoramic transport')
        k.text('Station label',name,(x,y-1.79,3.25),.20,'purple')
    flight=k.empty('Drone_FlightHeight',(0,0,1.2))
    drone=k.empty('Drone_Idle',(-3,-4,3),flight)
    k.box('Drone body',(0,0,0),(.65,.54,.35),'orange',.08,drone)
    k.box('Drone face',(0,-.28,0),(.42,.03,.15),'charcoal',.02,drone)
    for x in (-.55,.55):
        for y in (-.45,.45):
            k.link('Drone arm',(0,0,0),(x,y,0),.04,'metal',drone)
            k.cyl('Drone propeller',(x,y,.06),.24,.035,'purple',parent=drone)
    for f,z in [(1,3),(48,3.3),(96,3)]:
        drone.location.z=z; drone.keyframe_insert(data_path='location',frame=f)
    freeze_clip(drone,'Drone_Hover')
    # Close-to-ground luminaires create restrained, legible colored reflections.
    for x in (-10,10):
        for y in (-14,-6,2,12):
            k.box('Canal bollard',(x,y,.6),(.2,.2,1.2),'purple',.025)
            k.box('Canal diffuser',(x,y,1.13),(.24,.24,.15),'light',.03)
    return {'animations':['Monorail_Loop','Drone_Hover'],'notes':'Visual route only; player boarding needs application integration.'}

def lighting(scene, mode):
    presets={
      'day':((.42,.57,.80),.65,2.2,(1,.90,.76),(.5,-.45,-.6),1.0),
      'golden':((.42,.30,.27),.4,2.4,(1,.51,.20),(.85,-.2,-.24),2.8),
      'night':((.025,.04,.12),.3,.12,(.42,.62,1),(.7,.1,-.6),6.0)}
    color,strength,sunenergy,suncolor,direction,glow=presets[mode]
    bg=scene.world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value=(*color,1)
    bg.inputs['Strength'].default_value=strength
    sun=bpy.data.objects['Sun']; sun.data.energy=sunenergy; sun.data.color=suncolor
    sun.rotation_euler=Vector(direction).to_track_quat('-Z','Y').to_euler()
    key=bpy.data.objects['City softbox'].data
    key.energy={'day':22000,'golden':22000,'night':5000}[mode]
    key.color=(1,.58,.32) if mode=='golden' else (.60,.65,1) if mode=='night' else (1,.91,.82)
    bpy.data.objects['City rim'].data.energy=25000 if mode!='night' else 12000
    for o in scene.objects:
        if o.type=='LIGHT' and o.name.startswith('Street glow'):
            o.data.energy=18 if mode=='day' else 160 if mode=='golden' else 400
    for key in ('light','warm'):
        mat=bpy.data.materials.get('CITY / '+key)
        mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=glow
    scene['Lighting preset']=mode

def build():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene; scene.name='KROQUETITA / Ciudad completa'
    scene.unit_settings.system='METRIC'; scene.render.engine='CYCLES'
    scene.cycles.device='CPU'; scene.cycles.samples=32; scene.cycles.use_denoising=True
    scene.cycles.max_bounces=5; scene.cycles.glossy_bounces=3
    scene.render.threads_mode='FIXED'; scene.render.threads=4
    scene.render.resolution_x=1600; scene.render.resolution_y=1300; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGB'
    scene.view_settings.view_transform='AgX'; scene.world.use_nodes=True
    scene.render.fps=24; scene.frame_start=1; scene.frame_end=480
    scene['Status']='Art prototype: modular assets and animation clips. Web interaction not wired.'
    mats=make_materials()
    mats['water']=material('CITY / reflecting lagoon','#244757',.115,.48)
    mats['wet']=material('CITY / polished basalt','#253344',.16,.32)
    studio=bpy.data.collections.new('LIGHTING / not exported'); scene.collection.children.link(studio)
    d=bpy.data.lights.new('Sun','SUN'); d.angle=.12
    o=bpy.data.objects.new('Sun',d); studio.objects.link(o)
    light('City softbox',(-20,-25,35),(0,2,0),18000,(1,.80,.68),25,studio)
    light('City rim',(15,26,28),(0,4,0),25000,(.3,.65,1),20,studio)
    for x in (-10,10):
        for y in (-14,-6,2,12):
            light('Street glow', (x,y,1.2),(x,y,-.15),400,(.2,.85,1),1.5,studio)
    hero=camera('CAM / Ciudad', (53,-75,62),(0,3,1),55,studio,ortho=85)
    scene.camera=hero
    data=json.loads((HERE/'source-data.json').read_text(encoding='utf-8'))
    roots={}; records={}
    base=Kit('transport',mats); records['transport']=transit(base,data); roots['transport']=base.root
    lighting(scene,'golden')
    for i,(name,fn,loc) in enumerate(LAYOUT):
        print('BUILDING',name,flush=True)
        k=Kit(name,mats); records[name]=fn(k,data); roots[name]=k.root
        if name=='plaza':
            coffee,avatar=append_pilot(k); roots['coffee_machine']=coffee; roots['avatar']=avatar
        k.root.location=loc
        camera('CAM / '+name,Vector(loc)+Vector((14,-20,17)),Vector(loc)+Vector((0,0,1.2)),55,studio,ortho=22 if name!='career' else 26)
        if i in (0,3,7): checkpoint(scene,i+1)
    tour=camera('CAM / Tour 90 seconds',(9,-21,6),(0,-1,1),28,studio)
    for f,pos,target in [(300,(9,-21,6),(0,-1,1)),(732,(-24,-18,8),(-17,-9,1)),(1164,(22,-17,8),(17,-9,2)),(1596,(22,14,12),(0,9,3)),(2028,(4,20,8),(0,24,5)),(2460,(46,-60,43),(0,3,1))]:
        tour.location=pos; tour.rotation_euler=(Vector(target)-tour.location).to_track_quat('-Z','Y').to_euler()
        tour.keyframe_insert(data_path='location',frame=f); tour.keyframe_insert(data_path='rotation_euler',frame=f)
    scene.frame_set(150); scene.camera=hero
    for frame,name in [(1,'2021 / inicio'),(150,'2026 / ciudad completa'),(300,'Tour / inicio'),(2460,'Tour / fin')]: scene.timeline_markers.new(name,frame=frame)
    scene['Tour']='Select CAM / Tour 90 seconds; range 300-2460 at 24fps.'
    (HERE/'districts.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf-8')
    configure_view(scene)
    for mode in ('day','golden','night'):
        lighting(scene,mode)
        bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f'kroquetita-city-{mode}.blend'),compress=True)
    lighting(scene,'golden')
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kroquetita-city.blend'),compress=True)
    checkpoint(scene,9)
    print('KQ_GEOMETRY_DONE',flush=True)

if __name__=='__main__': build()
