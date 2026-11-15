"""Editable toy-vinyl pocket district for the two-window portal adventure.
World helper coordinates are glTF Y-up, +Z forward. The lane at z=0 stays clear.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
CITY=HERE.parent
sys.path.insert(0,str(CITY))
from kit import Kit, material, light, camera, subtree
WEB=CITY.parent.parent/'public/models/portal'
HERE.mkdir(parents=True,exist_ok=True);WEB.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
palette={
 'ivory':('#f3e6cc',.36,0,0), 'blue':('#3b6c91',.40,.12,0),
 'blue_dark':('#294761',.48,.16,0), 'blue_tile':('#507f9d',.43,.10,0),
 'violet':('#51446f',.38,0,0), 'lilac':('#a38bc4',.36,0,0),
 'charcoal':('#252c41',.60,0,0), 'metal':('#a6bac8',.28,.62,0),
 'copper':('#d29c5b',.34,.42,0), 'mint':('#84e2cf',.34,.12,.35),
 'lamp':('#ffe4a7',.34,0,.65), 'orange':('#e7924f',.38,0,0),
 'glass':('#97d7dc',.22,.18,0), 'soil':('#534336',.92,0,0),
 'leaf':('#398e78',.54,0,0), 'leaf_light':('#7bb58a',.49,0,0),
 'leaf_dark':('#25685c',.60,0,0), 'coffee':('#5c3728',.66,0,0),
}
mats={key:material('PORTAL / '+key,*settings) for key,settings in palette.items()}
for key,mat in mats.items():
    if key not in ('soil','leaf','leaf_light','leaf_dark','coffee'):
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Coat Weight'].default_value=.14
        bsdf.inputs['Coat Roughness'].default_value=.25
k=Kit('Portal_Outpost',mats);k.root.name='Portal_Outpost'
k.root['units']='metres';k.root['lane']='x -5..5, z=0, floor y=0'
def at(v):return (v[0],-v[2],v[1])
def group(name,p=(0,0,0),parent=None):return k.empty(name,at(p),parent)
def box(name,p,s,m,parent=None,r=.025):
    obj=k.box(name,at(p),(s[0],s[2],s[1]),m,min(r,min(s)*.4),parent)
    for mod in obj.modifiers:
        if mod.type=='BEVEL':mod.segments=2 if min(s)>.06 else 1
    return obj
def cyl(name,p,r,h,m,parent=None,verts=16):
    obj=k.cyl(name,at(p),r,h,m,vertices=verts,parent=parent)
    for mod in obj.modifiers:
        if mod.type=='BEVEL':mod.segments=2
    return obj
def ball(name,p,r,m,parent=None,sub=2):return k.ball(name,at(p),r,m,sub,parent)
def line(name,a,b,r,m,parent=None):
    obj=k.link(name,at(a),at(b),r,m,parent)
    # End-cap bevel rings are invisible on these millimetre stems and connections.
    for mod in list(obj.modifiers):
        if mod.type=='BEVEL':obj.modifiers.remove(mod)
    return obj
def text(name,words,p,size,m='ivory',parent=None):
    return k.text(name,words,at(p),size,m,parent)
def tube(name,points,radius,m,parent=None):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
    data.bevel_depth=radius;data.bevel_resolution=1;data.resolution_u=1
    path=data.splines.new('POLY');path.points.add(len(points)-1)
    for point,value in zip(path.points,points):point.co=(*at(value),1)
    obj=bpy.data.objects.new(name,data);k.col.objects.link(obj)
    obj.parent=parent or k.root;data.materials.append(k.m(m))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    return obj

# Rounded floating base, individual satin tiles and a softly raised ivory border.
box('Island foundation',(0,-.20,0),(10,.38,3.4),'violet',r=.14)
box('Foundation inset',(0,-.28,0),(9.70,.15,3.12),'blue_dark',r=.08)
box('Island edge light',(0,-.065,0),(9.85,.045,3.25),'mint',r=.035)
for ix in range(10):
    for iz in range(3):
        x=-4.455+ix*.99;z=-1.02+iz*1.02
        box('Satin tile %02d_%02d'%(ix,iz),(x,-.02,z),(.972,.04,1.002),
            'blue_tile' if (ix+iz)%5==0 else 'blue',r=.018)
for sign in (-1,1):
    box('Ivory end curb',(sign*4.94,.025,0),(.12,.09,3.34),'ivory',r=.035)
    box('Ivory long curb',(0,.025,sign*1.64),(9.8,.09,.12),'ivory',r=.035)
for x in (-4,-2,0,2,4):
    box('Lane brass dash',(x,.005,.70),(.15,.01,.022),'copper',r=.004)
text('Outpost plaque','K R O Q U E T I T A   /   O U T P O S T   0 1',(0,-.20,1.711),.105)
for sign in (-1,1):
    box('Plaque bolt',(sign*2.2,-.20,1.715),(.035,.035,.014),'copper',r=.007)

# Two miniature lanterns: one warm diffuser, shaded cap, manufactured seams and foot bolts.
for x in (-4.45,4.45):
    lantern=group('Lantern', (x,0,-1.14))
    box('Lantern foot',(0,.055,0),(.34,.11,.34),'ivory',lantern,.055)
    box('Lantern plinth',(0,.17,0),(.23,.15,.23),'violet',lantern,.035)
    box('Lantern mast',(0,1.0,0),(.095,1.56,.095),'violet',lantern,.025)
    box('Mast inlay',(0,1.0,.051),(.025,1.30,.008),'copper',lantern,.003)
    box('Lantern bottom',(0,1.80,0),(.40,.09,.40),'ivory',lantern,.04)
    box('Lantern glow',(0,1.99,0),(.27,.32,.27),'lamp',lantern,.045)
    for sx in (-1,1):
        for sz in (-1,1):
            box('Lantern frame',(sx*.165,1.99,sz*.165),(.035,.37,.035),'violet',lantern,.007)
    box('Lantern cap',(0,2.20,0),(.46,.11,.46),'violet',lantern,.045)
    box('Lantern crown',(0,2.27,0),(.14,.065,.14),'copper',lantern,.02)
    for sign in (-1,1):
        cyl('Foot screw',(sign*.10,.116,.10),.017,.009,'metal',lantern,8)

# CORE console and its two brain lobes; the tiny removable neuron stays independent.
core=group('Core_Stand',(-3.2,0,-.8))
box('Core foot',(0,.065,0),(1.04,.13,.88),'ivory',core,.06)
box('Core riser',(0,.37,-.02),(.68,.54,.62),'violet',core,.055)
box('Core console',(0,.91,0),(.86,.72,.70),'violet',core,.07)
box('Core front inset',(0,.92,.363),(.72,.54,.025),'charcoal',core,.022)
text('The Core title','THE CORE',(0,1.06,.383),.13,'ivory',core)
for j in range(3):
    box('Core status bar',(-.22+j*.22,.90,.385),(.12,.027,.015),'mint',core,.006)
    box('Core port',(-.22+j*.22,.75,.385),(.11,.065,.016),'metal',core,.008)
box('Core shoulder',(0,1.33,0),(1.02,.15,.85),'ivory',core,.05)
for sign in (-1,1):
    box('Core suspension',(sign*.31,1.55,-.03),(.085,.43,.10),'metal',core,.018)
    box('Core side panel',(sign*.453,.95,0),(.04,.42,.43),'blue_dark',core,.02)
    for j in range(3):box('Core cooling fin',(sign*.48,.84+j*.09,0),(.018,.025,.31),'copper',core,.003)
box('Core cradle',(0,1.80,0),(.92,.12,.71),'ivory',core,.045)
cyl('Core socket',(0,1.88,0),.22,.08,'violet',core,20)
brain=group('Core_Brain',(-3.2,2.22,-.84))
for sign in (-1,1):
    lobe=ball('Brain lobe',(sign*.235,0,0),.40,'lilac' if sign<0 else 'violet',brain,3)
    lobe.scale=(.76,1.04,1.0)
    for polygon in lobe.data.polygons:polygon.use_smooth=True
    for level in (-.17,.025,.20):
        points=[]
        for j in range(15):
            t=-1+j/7
            x=sign*.235+t*.22
            y=level+.035*math.sin(t*5+level*6)
            z=.416*math.sqrt(max(.08,1-((x-sign*.235)/.304)**2-(y/.40)**2))+.013
            points.append((x,y,z))
        tube('Brain cortex seam',points,.014,'ivory' if level<.1 else 'mint',brain)
    for j,p in enumerate(((sign*.36,.26,.09),(sign*.43,-.1,.16),(sign*.14,.12,.28))):
        ball('Cortex node',p,.047,'mint' if j%2 else 'lamp',brain,2)
line('Core memory bridge',(-.15,0,.1),(.15,0,.1),.027,'copper',brain)
neuron=group('Portal_Neuron',(-3.2,1.95,-.36))
ball('Neuron gem',(0,0,0),.125,'lamp',neuron,2)
for sign in (-1,1):
    line('Neuron stalk',(0,0,0),(sign*.19,.09,.025),.014,'copper',neuron)
    ball('Neuron tip',(sign*.19,.09,.025),.045,'mint',neuron,1)

# Coffee machine: openable top, separate spout, cup, tray, screen and small cream handle.
coffee=group('Coffee_Machine',(3,0,-.8))
box('Coffee feet',(0,.045,0),(1.20,.09,.94),'violet',coffee,.05)
box('Coffee lower',(0,.24,-.035),(1.06,.35,.79),'ivory',coffee,.055)
box('Coffee body',(0,.83,-.04),(1.02,1.02,.76),'violet',coffee,.075)
box('Coffee side stripe',(-.514,.83,-.04),(.018,.73,.56),'copper',coffee,.009)
box('Coffee front panel',(0,1.03,.349),(.82,.43,.03),'ivory',coffee,.028)
box('Coffee display',(-.15,1.08,.371),(.40,.21,.018),'charcoal',coffee,.016)
for row in range(2):
    box('Coffee display type',(-.16,1.13-row*.09,.384),(.24-row*.05,.026,.008),'mint',coffee,.003)
cyl('Coffee dial',(.29,1.08,.385),.065,.034,'copper',coffee,16).rotation_euler.x=math.pi/2
box('Coffee brewing recess',(0,.62,.35),(.70,.38,.035),'charcoal',coffee,.022)
box('Coffee spout',(0,.805,.385),(.22,.07,.085),'metal',coffee,.015)
box('Coffee tray',(0,.385,.38),(.80,.075,.13),'metal',coffee,.015)
for x in (-.27,-.135,0,.135,.27):box('Tray drainage',(x,.427,.38),(.018,.008,.085),'charcoal',coffee,.002)
cyl('Coffee cup',(0,.535,.35),.085,.20,'ivory',coffee,20)
cyl('Coffee surface',(0,.638,.35),.067,.008,'coffee',coffee,20)
for p,s in [((.10,.535,.35),(.06,.025,.035)),((.13,.57,.35),(.025,.09,.035)),((.10,.605,.35),(.06,.025,.035))]:
    box('Coffee cup handle',p,s,'ivory',coffee,.009)
lid=group('CoffeeLid',(0,1.38,-.37),coffee)
box('Coffee hinged lid',(0,.035,.34),(1.09,.10,.85),'ivory',lid,.035)
box('Coffee lid grip',(0,.105,.36),(.30,.045,.13),'copper',lid,.016)
for sign in (-1,1):
    box('Coffee hinge',(sign*.34,0,0),(.16,.10,.10),'metal',lid,.02)
text('Coffee title','CAFE',(0,.21,.385),.12,'violet',coffee)

# Hand-built leaf shapes, stems and veins; restrained front pots leave the walking lane open.
def leaf(name,a,b,width,mat):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    side=direction.cross(Vector((0,1,0)))
    if side.length<.1:side=direction.cross(Vector((1,0,0)))
    side.normalize();normal=side.cross(direction).normalized()
    middle=a.lerp(b,.52)
    points=[a,middle+side*width,b,middle-side*width,middle+normal*.025,middle-normal*.012]
    vertices=[at(p) for p in points]
    faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(k.m(mat))
    obj=bpy.data.objects.new(name,mesh);k.col.objects.link(obj);obj.parent=k.root
    line('Leaf vein',a+normal*.026,b+normal*.026,.006,'leaf_light')
def plant(x,z,scale=1):
    pot=group('Planter',(x,0,z))
    cyl('Planter saucer',(0,.04,0),.27*scale,.065,'ivory',pot,20)
    cyl('Planter pot',(0,.19*scale,0),.22*scale,.30*scale,'orange',pot,16)
    cyl('Planter rim',(0,.35*scale,0),.25*scale,.075*scale,'ivory',pot,20)
    cyl('Pot soil',(0,.388*scale,0),.208*scale,.018,'soil',pot,16)
    for j in range(7):
        angle=j*math.tau/7+.2
        start=(x,.39*scale,z)
        end=(x+math.cos(angle)*.25*scale,(.60+(j%3)*.10)*scale,z+math.sin(angle)*.25*scale)
        line('Plant stem',start,end,.012*scale,'leaf_dark')
        tip=(x+math.cos(angle)*.43*scale,end[1]+.16*scale,z+math.sin(angle)*.43*scale)
        leaf('Sculpted leaf',end,tip,.09*scale,['leaf','leaf_light','leaf_dark'][j%3])
        mid=Vector(start).lerp(Vector(end),.60)
        tip2=(x+math.cos(angle+.45)*.34*scale,end[1]-.02*scale,z+math.sin(angle+.45)*.34*scale)
        leaf('Lower leaf',mid,tip2,.075*scale,['leaf_light','leaf','leaf_dark'][j%3])
    for j in range(3):
        ball('Soil pebble',(math.cos(j*2)*.12,.405*scale,math.sin(j*2)*.12),.035*scale,'copper',pot,1)
plant(-1.40,-1.12,.85);plant(1.35,-1.12,1)
plant(-4.35,1.14,.65);plant(4.35,1.14,.65)
for x in (-1.4,1.35):
    box('Planter light plate',(x,.025,-1.12),(.66,.035,.68),'mint',r=.02)

hooks={'Hook_Core':[-3.2,1.95,-.36],'Hook_Coffee':[3,1.30,-.32],
       'Hook_Lane_Entry':[-4.65,.02,0],'Hook_Lane_Exit':[4.65,.02,0]}
for name,position in hooks.items():group(name,position)

# Render the same authored model before material batching for the runtime export.
scene=bpy.context.scene
studio=bpy.data.collections.new('Outpost studio');scene.collection.children.link(studio)
scene.world=bpy.data.worlds.new('Outpost world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.36,.45,.62,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.40
light('Outpost key',(-4,-5,8),(0,0,1),1400,(1,.88,.73),6,studio)
light('Outpost fill',(6,-1,5),(0,0,1),850,(.68,.84,1),5,studio)
light('Outpost rim',(-1,5,7),(0,0,1),1400,(.91,.84,1),5,studio)
scene.camera=camera('Outpost camera',(8,-11,8),(0,0,1),52,studio,ortho=12)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.cycles.max_bounces=5;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1400;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(HERE/'outpost-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.1
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'portal-outpost.blend'),compress=True)
bpy.ops.render.render(write_still=True)

# Only the export copy in memory is merged; the saved .blend keeps individual editable pieces.
dynamic={k.root,brain,neuron,lid}
meshes=[obj for obj in subtree(k.root) if obj.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.convert(target='MESH')
batches={}
for obj in meshes:
    anchor=obj.parent
    while anchor not in dynamic:anchor=anchor.parent
    key=(anchor,obj.data.materials[0])
    batches.setdefault(key,[]).append(obj)
for (anchor,mat),members in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:
        matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=matrix;obj.select_set(True)
    bpy.context.view_layer.objects.active=members[0]
    if len(members)>1:bpy.ops.object.join()
    merged=bpy.context.view_layer.objects.active;matrix=merged.matrix_world.copy()
    merged.parent=anchor;merged.matrix_world=matrix
    merged.name='Batch_'+anchor.name+'_'+mat.name.split('/')[-1].strip()
triangles=0
for obj in subtree(k.root):
    if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
bpy.ops.object.select_all(action='DESELECT')
for obj in subtree(k.root):obj.select_set(True)
bpy.context.view_layer.objects.active=k.root
target=WEB/'outpost.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
    export_apply=True,export_animations=False,export_yup=True,export_texcoords=False,export_extras=True)
summary={'file':str(target),'bytes':target.stat().st_size,'triangles':triangles,'meshes':len(batches),
         'baseSize':[10,.38,3.4],'lane':{'z':0,'minX':-5,'maxX':5,'y':0},
         'hooks':hooks,'dynamic':['CoffeeLid','Core_Brain','Portal_Neuron'],
         'coffeeLid':{'position':[3,1.38,-1.17],'openRotationX':-.85}}
(HERE/'outpost-manifest.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
assert target.stat().st_size<1000000,'Outpost export exceeded 1 MB'
assert triangles<35000,'Outpost exceeded triangle budget'
assert len(batches)<=60,'Outpost exceeded draw budget'
print('OUTPOST_COMPLETE',summary,flush=True)
