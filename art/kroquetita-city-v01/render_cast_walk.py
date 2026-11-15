"""Eight-frame right-facing locomotion, rendered offline from the editable Blender cast.

No source model is modified. OpenImageIO only assembles the rendered RGBA frames.
Run Blender --background --factory-startup --threads 4 --python render_cast_walk.py.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector
import numpy as np
import OpenImageIO as oiio

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import light, camera
OUT=HERE.parent.parent/'public/images/loading'
FRAMES=HERE/'cast/walk-frames'
OUT.mkdir(parents=True,exist_ok=True);FRAMES.mkdir(parents=True,exist_ok=True)
NAMES=('Claude','ChatGPT','Gemini','Qwen3','Mistral','duck')
WIDTH,HEIGHT,COUNT=192,224,8
report=[];sheet_arrays=[]

def pixels(path):
    src=oiio.ImageInput.open(str(path))
    data=src.read_image(format=oiio.UINT8)
    src.close()
    return np.array(data,dtype=np.uint8)

def write(path,data,webp=False):
    output=oiio.ImageOutput.create(str(path))
    if not output:return False
    spec=oiio.ImageSpec(data.shape[1],data.shape[0],data.shape[2],oiio.UINT8)
    spec.attribute('CompressionQuality',82 if webp else 100)
    spec.attribute('png:compressionLevel',9)
    if not output.open(str(path),spec):return False
    okay=output.write_image(data)
    output.close()
    return okay

for name in NAMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(HERE/'cast'/(name+'.blend')),link=False) as (a,b):
        b.collections=['Actor']
    actors=b.collections[0];scene=bpy.context.scene
    scene.collection.children.link(actors)
    root=next(obj for obj in actors.objects if obj.parent is None)
    joints={obj.name:obj for obj in actors.objects}
    bases={obj.name:obj.location.copy() for obj in actors.objects}
    duck_feet=[];duck_wings=[]
    def attach_pivot(label,position,objects):
        pivot=bpy.data.objects.new(label,None);actors.objects.link(pivot)
        pivot.parent=root;pivot.location=position
        bpy.context.view_layer.update()
        for obj in objects:
            world=obj.matrix_world.copy();obj.parent=pivot;obj.matrix_world=world
        return pivot
    if name=='duck':
        for sign in (-1,1):
            feet=[obj for obj in actors.objects if obj.type=='MESH' and
                  obj.name.startswith(('DuckFoot','WebbedToe')) and obj.location.x*sign>0]
            wing=[obj for obj in actors.objects if obj.type=='MESH' and
                  obj.name.startswith(('Wing','WingFeather')) and obj.location.x*sign>0]
            duck_feet.append(attach_pivot('StrideFoot_'+str(sign),(sign*.19,-.21,.075),feet))
            duck_wings.append(attach_pivot('FlapWing_'+str(sign),(sign*.36,0,.41),wing))
        bases.update({obj.name:obj.location.copy() for obj in duck_feet+duck_wings})
    def pose(index):
        phase=math.tau*index/COUNT
        wave=math.sin(phase)
        root.location=(0,0,0)
        root.rotation_euler=(.10,0,.035*wave)
        if name!='duck':
            for side,sign in (('L',1),('R',-1)):
                leg=joints['Leg_'+side];arm=joints['Arm_'+side]
                leg.rotation_euler.x=sign*.70*wave
                leg.location=bases[leg.name].copy()
                leg.location.z+=.06*max(0,-sign*math.cos(phase))
                arm.rotation_euler.x=-sign*.65*wave
                arm.rotation_euler.y=sign*.08
            joints['Arms'].rotation_euler.z=-.035*wave
            joints['Head'].rotation_euler=(.025*math.cos(phase*2),0,-.025*wave)
        else:
            root.rotation_euler=(.13,.055*wave,0)
            for index,pivot in enumerate(duck_feet):
                sign=-1 if index==0 else 1
                pivot.location=bases[pivot.name].copy()
                pivot.location.x=sign*.25
                pivot.location.y-=sign*.16*wave
                pivot.location.z+=.10*max(0,sign*wave)
                pivot.rotation_euler.x=sign*.55*wave
                pivot.scale=(1.12,1.12,1.12)
            for index,pivot in enumerate(duck_wings):
                sign=-1 if index==0 else 1
                pivot.rotation_euler.y=sign*(.12+.28*(1+math.sin(phase*2)))
        bpy.context.view_layer.update()
        foot_prefix=('DuckFoot','WebbedToe') if name=='duck' else ('Leg_L_shoe','Leg_R_shoe','ShoeSole','SneakerToe')
        feet_points=[obj.matrix_world@Vector(c) for obj in actors.objects
                     if obj.type=='MESH' and obj.name.startswith(foot_prefix) for c in obj.bound_box]
        if feet_points:root.location.z=-min(point.z for point in feet_points)+.012
        root.location.z+=.016*(1-math.cos(phase*2))
        bpy.context.view_layer.update()
    all_points=[]
    for frame in range(COUNT):
        pose(frame)
        all_points.extend(obj.matrix_world@Vector(c) for obj in actors.objects if obj.type=='MESH' for c in obj.bound_box)
    low=Vector(tuple(min(p[i] for p in all_points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in all_points) for i in range(3)))
    center=(low+high)*.5
    studio=bpy.data.collections.new('Walk studio');scene.collection.children.link(studio)
    scene.render.resolution_x=WIDTH;scene.render.resolution_y=HEIGHT;scene.render.resolution_percentage=100
    # Camera on -X: Blender -Y forward projects to screen RIGHT, with the visor visible.
    scene.camera=camera('Walk camera',center+Vector((-6,-3.1,2.15)),center,50,studio,ortho=1)
    bpy.context.view_layer.update()
    inverse=scene.camera.matrix_world.inverted();projected=[inverse@p for p in all_points]
    minx,maxx=min(p.x for p in projected),max(p.x for p in projected)
    miny,maxy=min(p.y for p in projected),max(p.y for p in projected)
    frame=scene.camera.data.view_frame(scene=scene)
    spanx=max(p.x for p in frame)-min(p.x for p in frame)
    spany=max(p.y for p in frame)-min(p.y for p in frame)
    scene.camera.data.ortho_scale=max((maxx-minx)/spanx,(maxy-miny)/spany)*1.16
    offset=Vector(((minx+maxx)/2,(miny+maxy)/2,0))
    scene.camera.location+=scene.camera.matrix_world.to_quaternion()@offset
    light('Walk key',(-3,-4,5),center,500,(1,.9,.78),4,studio)
    light('Walk fill',(4,-2,3),center,350,(.72,.87,1),3,studio)
    light('Walk rim',(0,3,4),center,500,(1,.98,.85),3,studio)
    scene.world=bpy.data.worlds.new('Walk world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.7,.9,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8';scene.render.image_settings.compression=100
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.2
    frames=[]
    for index in range(COUNT):
        pose(index);path=FRAMES/(name+'-'+str(index)+'.png')
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        data=pixels(path);data[data[:,:,3]==0,:3]=0
        frames.append(data)
    sheet=np.concatenate(frames,axis=1)
    assert sheet.shape==(HEIGHT,WIDTH*COUNT,4)
    assert all(np.any(frames[i]!=frames[(i+1)%COUNT]) for i in range(COUNT))
    png=OUT/(name+'-walk.png');webp=OUT/(name+'-walk.webp')
    assert write(png,sheet)
    webp_ok=write(webp,sheet,True)
    sheet_arrays.append(sheet)
    report.append({'id':name,'frames':COUNT,'frameWidth':WIDTH,'frameHeight':HEIGHT,
                   'width':WIDTH*COUNT,'height':HEIGHT,'seconds':.72,'direction':'right',
                   'pngBytes':png.stat().st_size,'webpBytes':webp.stat().st_size if webp_ok else None})
    print('WALK_DONE',name,report[-1],flush=True)
# A contact sheet on a neutral studio background makes both feet easy to inspect.
contact=np.concatenate(sheet_arrays,axis=0)
alpha=contact[:,:,3:4].astype(np.float32)/255
rgb=(contact[:,:,:3]*alpha+np.array([227,233,242])*(1-alpha)).astype(np.uint8)
preview=np.concatenate([rgb,np.full((*rgb.shape[:2],1),255,dtype=np.uint8)],axis=2)
assert write(HERE/'cast-walk-contact.png',preview)
(HERE/'cast/walk-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('WALK_COMPLETE',sum(r['pngBytes'] for r in report),sum(r['webpBytes'] or 0 for r in report),flush=True)
