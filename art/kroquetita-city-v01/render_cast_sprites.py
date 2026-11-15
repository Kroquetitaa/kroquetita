"""Transparent loading sprites rendered from the same editable, polished Blender cast."""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import light, camera

OUT=HERE.parent.parent/'public/images/loading'
OUT.mkdir(parents=True,exist_ok=True)
report=[]
for name in ('Claude','ChatGPT','Gemini','Qwen3','Mistral','duck'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(HERE/'cast'/(name+'.blend')),link=False) as (a,b):
        b.collections=['Actor']
    actor=b.collections[0]
    scene=bpy.context.scene
    scene.collection.children.link(actor)
    root=next(o for o in actor.objects if o.parent is None)
    if name!='duck':
        for joint,angle in (('Leg_L',-21),('Leg_R',21),('Arm_L',16),('Arm_R',-16)):
            obj=next((o for o in actor.objects if o.name.split('.')[0]==joint),None)
            if obj:obj.rotation_euler.x=math.radians(angle)
    else:
        root.rotation_euler.x=math.radians(5)
    bpy.context.view_layer.update()
    points=[obj.matrix_world @ Vector(corner) for obj in actor.objects if obj.type=='MESH' for corner in obj.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(low+high)/2
    studio=bpy.data.collections.new('Sprite studio')
    scene.collection.children.link(studio)
    scene.camera=camera('Sprite camera',center+Vector((3.4,-7,3.1)),center,50,studio,ortho=2)
    bpy.context.view_layer.update()
    inverse=scene.camera.matrix_world.inverted()
    projected=[inverse @ point for point in points]
    width=max(p.x for p in projected)-min(p.x for p in projected)
    height=max(p.y for p in projected)-min(p.y for p in projected)
    scene.camera.data.ortho_scale=max(width,height)*1.25
    offset=Vector(((min(p.x for p in projected)+max(p.x for p in projected))/2,
                   (min(p.y for p in projected)+max(p.y for p in projected))/2,0))
    scene.camera.location+=scene.camera.matrix_world.to_quaternion() @ offset
    light('Sprite key',(-3,-4,5),center,500,(1,.9,.78),4,studio)
    light('Sprite fill',(4,-2,3),center,350,(.72,.87,1),3,studio)
    light('Sprite rim',(0,3,4),center,500,(1,.98,.85),3,studio)
    scene.world=bpy.data.worlds.new('Sprite world')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.7,.9,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.film_transparent=True
    scene.render.resolution_x=256;scene.render.resolution_y=256
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.35
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    report.append({'id':name,'path':str(OUT/(name+'.png')),'bytes':(OUT/(name+'.png')).stat().st_size})
    print('SPRITE_DONE',name,flush=True)
(HERE/'cast/sprite-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('SPRITES_COMPLETE',sum(item['bytes'] for item in report),flush=True)
