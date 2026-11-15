"""El reverso de Kroquetita: separate lens-only, native-coordinate Blender layer.

Reads the generated city assembly rather than reproducing an obsolete layout.
The editable .blend remains unbatched; the GLB is batched around its animation pivots.
"""
import bpy, sys, math, json, re
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
CITY=HERE.parent;PROJECT=CITY.parent.parent
sys.path.insert(0,str(CITY))
from kit import Kit, material, light, camera, subtree
raw=(PROJECT/'src/world/blenderAssembly.ts').read_text(encoding='utf-8')
native=json.loads(re.search(r'export const blenderAssembly = (\{[\s\S]*\}) as const',raw).group(1))
OUT=PROJECT/'public/models/dimensions'
HERE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
colors={
 'floor':('#213849',.56,.15,0), 'tile':('#305769',.46,.14,0),
 'violet':('#5a467c',.40,.05,0), 'lilac':('#a28bc4',.40,.05,0),
 'cream':('#eadfc9',.40,0,0), 'charcoal':('#192333',.65,.08,0),
 'copper':('#cb9860',.35,.42,0), 'gold':('#edc567',.31,.25,.3),
 'teal':('#52b8b0',.37,.20,0), 'signal':('#71f1d6',.37,.05,.8),
 'amber':('#ffcf80',.40,0,.8), 'rose':('#cf8bc2',.42,.03,.3),
 'glass':('#7dc5cc',.22,.25,0), 'rubber':('#283044',.78,0,0),
 'duck':('#efc956',.37,0,0), 'beak':('#df9145',.39,0,0),
 'water':('#27667e',.24,.40,0),
}
mats={name:material('REVERSE / '+name,*values) for name,values in colors.items()}
for name,mat in mats.items():
    if name not in ('floor','rubber'):
        shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Coat Weight'].default_value=.12
        shader.inputs['Coat Roughness'].default_value=.28
k=Kit('Underworld',mats);k.root.name='Underworld'
k.root['layer']='lens-only';k.root['assembly_source']=native['source']
def at(p):return (p[0],-p[2],p[1])
def group(name,p=(0,0,0),parent=None):return k.empty(name,at(p),parent)
def box(name,p,s,m,parent=None,bevel=.055,segments=1):
    obj=k.box(name,at(p),(s[0],s[2],s[1]),m,min(bevel,min(s)*.35),parent)
    for mod in obj.modifiers:
        if mod.type=='BEVEL':mod.segments=segments
    return obj
def cyl(name,p,r,h,m,parent=None,vertices=16):
    obj=k.cyl(name,at(p),r,h,m,vertices=vertices,parent=parent)
    for mod in list(obj.modifiers):
        if mod.type=='BEVEL':mod.segments=1
    return obj
def ball(name,p,r,m,parent=None,sub=1):return k.ball(name,at(p),r,m,sub,parent)
def link(name,a,b,r,m,parent=None):
    obj=k.link(name,at(a),at(b),r,m,parent)
    for mod in list(obj.modifiers):
        if mod.type=='BEVEL':obj.modifiers.remove(mod)
    return obj
def label(name,words,p,size=.32,m='cream',parent=None):
    return k.text(name,words,at(p),size,m,parent)
def pipe(name,points,radius=.11,m='teal',parent=None,closed=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.bevel_depth=radius;curve.bevel_resolution=1;curve.resolution_u=5
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,co in zip(spline.bezier_points,points):
        point.co=at(co);point.handle_left_type='AUTO';point.handle_right_type='AUTO'
    spline.use_cyclic_u=closed
    obj=bpy.data.objects.new(name,curve);k.col.objects.link(obj)
    obj.parent=parent or k.root;curve.materials.append(k.m(m))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    return obj
def ring(name,p,radius,wire,m,parent=None):
    return pipe(name,[(p[0]+math.cos(a)*radius,p[1],p[2]+math.sin(a)*radius)
        for a in [i*math.tau/12 for i in range(12)]],wire,m,parent,True)

districts={}
for name in ('career','library','plaza','hangar','factory','lab','bugs','brain_inside'):
    source=native['districts'][name]
    x,_,z=source['position'];floor=source['floor']
    w,d=floor['size'][0]-.8,floor['size'][2]-.8
    depth=-3.35 if name!='plaza' else -3.15
    box(name+' exposed basement',(x,depth-.16,z),(w,.28,d),'violet',bevel=.12,segments=2)
    box(name+' satin subfloor',(x,depth,z),(w-.14,.07,d-.14),'floor',bevel=.035)
    for sign in (-1,1):
        box(name+' copper cut edge',(x,depth+.06,z+sign*(d/2-.08)),(w-.2,.08,.10),'copper',bevel=.018)
        box(name+' side edge',(x+sign*(w/2-.08),depth+.06,z),(.10,.08,d-.2),'copper',bevel=.018)
    for step in (-1,0,1):
        box(name+' floor panel',(x+step*w/3,depth+.043,z),(w/3-.15,.012,d-.4),'tile',bevel=0)
    districts[name]={'position':[x,depth,z],'size':[w,.28,d],'source':source['position']}

# The roots of THE CORE: a warm context crystal, orbital rings and six thick neural routes.
cx,_,cz=native['hooks']['Hook_Career_CoreFocus']
core=group('NeuralCore',(cx,-1.30,cz))
cyl('Core well',(cx,-3.17,cz),1.62,.30,'charcoal',vertices=32)
cyl('Core stepped plinth',(cx,-2.91,cz),1.20,.27,'cream',vertices=24)
cyl('Core collar',(cx,-2.66,cz),.86,.22,'copper',vertices=20)
vertices=[];sides=6
for y,radius in ((-1.13,.40),(-.65,.78),(.25,.61),(.96,0)):
    for i in range(sides):
        a=math.tau*i/sides
        vertices.append(at((math.cos(a)*radius,y,math.sin(a)*radius)))
faces=[]
for band in range(3):
    for i in range(sides):faces.append((band*sides+i,band*sides+(i+1)%sides,(band+1)*sides+(i+1)%sides,(band+1)*sides+i))
mesh=bpy.data.meshes.new('Faceted context');mesh.from_pydata(vertices,[],faces)
mesh.materials.append(mats['gold']);mesh.materials.append(mats['amber'])
crystal=bpy.data.objects.new('Context crystal',mesh);k.col.objects.link(crystal);crystal.parent=core
for polygon in mesh.polygons:polygon.material_index=1 if polygon.index%5==0 else 0
orbital=group('Ring',(0,-.35,0),core)
ring('Memory orbit',(0,0,0),1.35,.055,'signal',orbital)
for i in range(6):
    a=i*math.tau/6
    ball('Orbit neuron',(math.cos(a)*1.35,0,math.sin(a)*1.35),.13,'gold',orbital,2)
ring('Core outer rim',(cx,-3.02,cz),1.95,.045,'signal')
for side in (-1,1):
    for i in range(3):
        x=cx+side*(2.5+i*1.45);z=cz+1.4+(i%2)*1.8
        box('Root memory terminal',(x,-2.84,z),(.95,.55,.68),'violet')
        box('Root terminal light',(x,-2.54,z),(.60,.035,.34),'signal')
        pipe('Local neural root',[(cx+side*.7,-2.6,cz),(x*.55,-2.8,z-.45),(x,-2.77,z)],.10,'teal')
label('Context chamber title','CONTEXTO / NIVEL RAIZ',(cx,-2.84,-5.54),.36)
routes=[
 [(cx,-2.76,cz),(-8.8,-2.92,-11.1),(-9.7,-2.88,-8),(-16.4,-2.76,-8)],
 [(cx,-2.76,cz),(8.8,-2.92,-11.1),(9.7,-2.88,-8),(16.2,-2.76,-8)],
 [(cx,-2.76,cz),(-8.7,-2.96,-6),(-9.6,-2.98,2.4),(-10.3,-2.92,8.5),(-17,-2.74,9)],
 [(cx,-2.76,cz),(8.7,-2.96,-6),(9.6,-2.98,2.4),(10.3,-2.92,8.5),(17,-2.74,9)],
 [(cx,-2.76,cz),(-.8,-2.96,-4),(-1.0,-2.98,5.3),(0,-2.8,12)],
 [(cx,-2.76,cz),(0,-2.96,-15),(0,-2.97,-19.5),(0,-2.8,-24)],
]
for i,points in enumerate(routes):
    pipe('Neural root %02d'%i,points,.16,'violet')
    pipe('Root luminous filament %02d'%i,[(x,y+.12,z) for x,y,z in points],.048,'signal')
    for p in points[1:-1]:
        cyl('Root junction',p,.26,.16,'copper',vertices=12)

# A colossal duck hatching below the little plaza: playful, immediately legible through the lens.
px,_,pz=native['districts']['plaza']['position']
cyl('Duck reservoir',(px,-3.01,pz),2.75,.24,'cream',vertices=48)
cyl('Teal duck pond',(px,-2.87,pz),2.60,.06,'water',vertices=48)
for radius in (1.9,2.30,2.48):ring('Pond ripple',(px,-2.829,pz),radius,.024,'signal')
duck=group('BobDuck',(px,-2.25,pz))
box('Colossal duck body',(0,.90,0),(2.80,1.36,2.68),'duck',duck,.25,2)
box('Colossal duck head',(0,1.86,.84),(1.62,1.48,1.51),'duck',duck,.20,2)
box('Duck broad beak',(0,1.58,1.76),(1.05,.32,.86),'beak',duck,.09,2)
box('Duck beak smile',(0,1.49,2.195),(.85,.035,.028),'copper',duck,.012)
for sign in (-1,1):
    box('Duck eye white',(sign*.47,2.10,1.60),(.36,.44,.08),'cream',duck,.06,2)
    box('Duck pupil',(sign*.47+.045,2.10,1.653),(.18,.27,.055),'charcoal',duck,.04,2)
    box('Duck eye shine',(sign*.47-.015,2.18,1.688),(.065,.075,.018),'amber',duck,.015)
    wing=box('Duck wing',(sign*1.41,.98,-.12),(.25,.78,1.64),'gold',duck,.09,2)
    for j in range(3):box('Duck feather',(sign*1.55,.80+j*.13,-.26+j*.18),(.035,.075,.70),'cream',duck,.015)
    box('Duck webbed foot',(sign*.64,.18,.72),(.78,.19,.95),'beak',duck,.08,2)
    box('Duck nostril',(sign*.24,1.76,1.85),(.10,.025,.14),'copper',duck,.015)
box('Duck tail',(0,1.34,-1.45),(1.02,.48,.65),'duck',duck,.13,2)
# Open rear shell: cracked segments surround the duck without hiding its expression.
for i in range(9):
    angle=math.radians(30+i*15)
    x=px+math.cos(angle)*1.78;z=pz-math.sin(angle)*1.55
    shard=box('Broken egg petal',(x,-2.10,z),(.70,1.55+(i%2)*.20,.15),'cream',bevel=.045)
    shard.rotation_euler.z=-angle
for x,z in ((-2.25,1.8),(1.9,2.1),(2.3,.8)):
    shard=box('Egg shell fragment',(px+x,-2.72,pz+z),(.58,.10,.45),'cream',bevel=.035)
    shard.rotation_euler.z=x*.7
label('Duck incubation sign','PROTOCOLO CUAC',(px,-2.78,pz+3.17),.42,'amber')
for sign in (-1,1):
    box('Duck incubator console',(px+sign*4.0,-2.66,pz-.1),(1.20,.95,.80),'violet',bevel=.08,segments=2)
    box('Duck console screen',(px+sign*4.0,-2.20,pz-.1),(.93,.06,.57),'glass')
    for j in range(3):box('Duck console indicator',(px+sign*4.0-.27+j*.27,-2.15,pz-.1),(.12,.025,.22),'signal')

# Factory: copper pressure vessels turn context into little golden croquettes.
fx,_,fz=native['districts']['factory']['position']
for x in (-3.0,0,3.0):
    cyl('Croquette reactor foot',(fx+x,-3.04,fz-2.5),.92,.30,'charcoal',vertices=20)
    cyl('Croquette reactor',(fx+x,-2.02,fz-2.5),.74,1.75,'violet',vertices=24)
    cyl('Reactor cream lid',(fx+x,-1.10,fz-2.5),.84,.16,'cream',vertices=24)
    ring('Reactor copper belt',(fx+x,-2.3,fz-2.5),.77,.07,'copper')
    box('Reactor window',(fx+x,-1.95,fz-1.76),(.48,.72,.07),'glass',bevel=.05)
    for j in range(3):box('Reactor level',(fx+x,-2.15+j*.17,fz-1.71),(.30,.05,.025),'amber')
pipe('Factory overhead recipe',[ (fx-3,-1.0,fz-2.5),(fx-3,-.55,fz-3.7),(fx,-.55,fz-3.7),(fx+3,-.55,fz-3.7),(fx+3,-1,fz-2.5)],.15,'copper')
pipe('Factory pouring chute',[(fx+3,-1.9,fz-1.8),(fx+3,-1.75,fz-.4),(fx+2.9,-2.25,fz+.9)],.19,'teal')
box('Conveyor chassis',(fx,-2.68,fz+.9),(9.1,.42,1.48),'violet',bevel=.10,segments=2)
box('Conveyor belt',(fx,-2.43,fz+.9),(8.8,.12,1.27),'rubber',bevel=.035)
for x in range(-4,5):
    box('Conveyor belt tread',(fx+x,-2.355,fz+.9),(.042,.025,1.15),'metal' if 'metal' in mats else 'copper',bevel=.005)
for sign in (-1,1):box('Conveyor side rail',(fx,-2.24,fz+.9+sign*.73),(9.1,.13,.10),'cream')
conveyor=group('Conveyor',(fx,-2.25,fz+.9))
items=[]
for i in range(6):
    item=group('Item_%02d'%(i+1),(-3.5+i*1.4,.08,0),conveyor);items.append(item)
    box('Croquette',(0,.22,0),(.90,.43,.60),'gold',item,.14,2)
    for x in (-.15,.15):
        box('Croquette eye',(x,.26,.306),(.075,.09,.018),'charcoal',item,.012)
    box('Croquette smile',(0,.14,.31),(.18,.025,.018),'copper',item,.006)
    for j in range(3):ball('Crisp crumb',(-.23+j*.23,.45,.04*(j%2)),.055,'beak',item,1)
label('Factory secret name','FABRICA DE CONTEXTO',(fx,-2.83,fz+4.8),.42,'amber')

# Hangar: an ivory rocket waiting beneath the project demos, with a copper launch pad.
hx,_,hz=native['districts']['hangar']['position']
cyl('Rocket launch pad',(hx,-3.05,hz),2.10,.27,'charcoal',vertices=32)
ring('Launch pad ring',(hx,-2.89,hz),1.85,.065,'signal')
rocket=group('Secret_Rocket',(hx,-2.90,hz))
cyl('Rocket hull',(0,1.46,0),.75,2.40,'cream',rocket,24)
cyl('Rocket base band',(0,.40,0),.80,.22,'copper',rocket,24)
cyl('Rocket shoulder band',(0,2.53,0),.77,.14,'teal',rocket,24)
bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.75,radius2=.08,depth=1.04,location=at((0,3.10,0)))
nose=bpy.context.object;nose.name='Rocket nose';nose.data.materials.append(mats['violet'])
for col in list(nose.users_collection):col.objects.unlink(nose)
k.col.objects.link(nose);nose.parent=rocket
window=cyl('Rocket window rim',(0,1.76,.735),.33,.12,'copper',rocket,24);window.rotation_euler.x=math.pi/2
window=cyl('Rocket window',(0,1.76,.805),.25,.035,'glass',rocket,24);window.rotation_euler.x=math.pi/2
for angle in (0,math.tau/3,math.tau*2/3):
    fin=box('Rocket fin',(math.cos(angle)*.91,.58,math.sin(angle)*.91),(.23,1.05,.78),'teal',rocket,.07,2)
    fin.rotation_euler.z=-angle
cyl('Rocket engine',(0,.10,0),.47,.23,'charcoal',rocket,16)
label('Rocket cargo','IDEA 01',(0,1.07,.768),.20,'violet',rocket)
for sign in (-1,1):
    box('Launch equipment',(hx+sign*3.7,-2.66,hz-1.8),(1.45,1.2,1.1),'violet',bevel=.09,segments=2)
    box('Launch equipment screen',(hx+sign*3.7,-2.02,hz-1.8),(1.08,.06,.72),'glass')
pipe('Rocket fueling line',[(hx-3.7,-2.0,hz-1.8),(hx-2.6,-2.7,hz-2.5),(hx-1.05,-2.75,hz),(hx-.72,-2.2,hz)],.15,'copper')
label('Hangar secret name','PROTOTIPO EN ORBITA',(hx,-2.83,hz+4.8),.42,'signal')

# Library: memory cartridges, a rotating-looking index disc and stacks of golden knowledge.
lx,_,lz=native['districts']['library']['position']
for sign in (-1,1):
    x=lx+sign*3.65
    box('Archive rack',(x,-1.96,lz-1.7),(1.55,2.65,4.9),'violet',bevel=.10,segments=2)
    for row in range(3):
        for col in range(5):
            z=lz-3.55+col*.94;y=-2.83+row*.79
            box('Memory cartridge',(x-sign*.84,y,z),(.17,.58,.68),('teal','copper','lilac')[(row+col)%3],bevel=.035)
            box('Memory notch',(x-sign*.94,y+.12,z),(.035,.055,.38),'signal',bevel=.009)
cyl('Archive index plinth',(lx,-2.96,lz+.5),1.4,.29,'cream',vertices=24)
ring('Archive directory',(lx,-2.65,lz+.5),1.20,.06,'copper')
for i in range(8):
    a=i*math.tau/8
    box('Memory index card',(lx+math.cos(a)*1.15,-2.14,lz+.5+math.sin(a)*1.15),(.27,.85,.13),'glass',bevel=.035)
for i in range(3):
    box('Forgotten book',(lx+.25*(i%2),-2.66+i*.24,lz+3.10),(2.2,.20,1.35),['lilac','gold','teal'][i],bevel=.045)
label('Memory archive name','MEMORIA PROFUNDA',(lx,-2.83,lz+4.8),.42,'amber')

# The remaining native rooms also have a reveal: experiments, a bottled bug and idea seeds.
ax,_,az=native['districts']['lab']['position']
for i,(dx,dz) in enumerate(((-3.7,-2.9),(3.7,-2.9),(-3.7,2.7),(3.7,2.7))):
    cyl('Experiment stand',(ax+dx,-2.96,az+dz),.93,.29,'cream',vertices=20)
    cyl('Experiment capsule',(ax+dx,-2.05,az+dz),.65,1.6,'violet',vertices=20)
    cyl('Experiment lid',(ax+dx,-1.20,az+dz),.73,.16,'glass',vertices=20)
    ring('Experiment status',(ax+dx,-1.11,az+dz),.54,.038,'signal')
    ball('Experiment embryo',(ax+dx,-.91,az+dz),.26,['gold','rose','signal','glass'][i],sub=2)
cyl('Laboratory central stage',(ax,-2.97,az),1.35,.27,'charcoal',vertices=24)
for i in range(5):
    a=i*math.tau/5
    p=(ax+math.cos(a),-1.63+(i%2)*.35,az+math.sin(a))
    ball('Idea node',p,.22,'signal' if i%2 else 'rose',sub=2)
    link('Idea connection',(ax,-2.60,az),p,.045,'copper')
label('Laboratory secret name','IDEAS EN INCUBACION',(ax,-2.83,az+4.9),.39,'signal')
bx,_,bz=native['districts']['bugs']['position']
cyl('Bug trap',(bx,-2.99,bz),2.15,.26,'cream',vertices=32)
box('Bug sleeping body',(bx,-1.96,bz),(2.4,1.15,2.7),'violet',bevel=.22,segments=2)
box('Bug face',(bx,-1.97,bz+1.52),(1.7,.85,.62),'charcoal',bevel=.15,segments=2)
for sign in (-1,1):
    box('Bug sleepy eye',(bx+sign*.43,-1.9,bz+1.85),(.32,.09,.035),'amber')
    for z in (-.9,0,.9):link('Bug folded leg',(bx+sign*.95,-2.53,bz+z),(bx+sign*1.85,-2.80,bz+z+.35),.10,'copper')
    link('Bug feeler',(bx+sign*.5,-1.6,bz+1.6),(bx+sign*.8,-1.02,bz+1.9),.05,'teal')
    ball('Bug feeler glow',(bx+sign*.8,-1.02,bz+1.9),.13,'signal',sub=2)
ring('Bug containment halo',(bx,-.65,bz),2.0,.055,'signal')
for i in range(4):
    a=math.pi/4+i*math.pi/2
    link('Trap support',(bx+math.cos(a)*2,-2.88,bz+math.sin(a)*2),(bx+math.cos(a)*2,-.65,bz+math.sin(a)*2),.07,'teal')
label('Bug warning','NO TOCAR / FUNCIONA',(bx,-2.83,bz+4.8),.39,'amber')
ox,_,oz=native['districts']['brain_inside']['position']
cyl('Idea vault',(ox,-2.98,oz),2.35,.27,'violet',vertices=32)
for i in range(6):
    a=i*math.tau/6
    p=(ox+math.cos(a)*1.65,-2.02+(i%2)*.35,oz+math.sin(a)*1.65)
    ball('Idea seed',p,.42,'glass' if i%2 else 'gold',sub=2)
    link('Seed stem',(p[0],-2.82,p[2]),p,.06,'copper')
ring('Idea vault glow',(ox,-2.79,oz),2.07,.045,'signal')
label('Idea vault label','SEMILLAS DEL FUTURO',(ox,-2.83,oz+4.2),.34,'signal')

hooks={
 'Hook_Secret_Core':[cx,-1.30,cz], 'Hook_Secret_Factory':[fx,-1.5,fz],
 'Hook_Secret_Duck':[px,-.4,pz+.8], 'Hook_Secret_Rocket':[hx,-1.4,hz],
 'Hook_Secret_Memory':[lx,-2,lz],
 'Hook_Actor_Core':[3,-3.30,-7.8], 'Hook_Actor_Factory_A':[13.5,-3.30,12.5],
 'Hook_Actor_Factory_B':[19.2,-3.30,12.5], 'Hook_Actor_Memory':[-17,-3.30,-11.2],
 'Hook_Actor_Hangar':[-20,-3.30,12], 'Hook_Actor_Duck':[2.7,-3.10,4.1],
}
for name,p in hooks.items():group(name,p)
studio=bpy.data.collections.new('Reverse studio');bpy.context.scene.collection.children.link(studio)
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Reverse world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.055,.09,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
light('Reverse warm key',(-19,-23,30),(0,3,-1.5),12000,(1,.83,.66),24,studio)
light('Reverse teal fill',(25,-4,20),(0,3,-1.5),10000,(.54,.89,1),22,studio)
light('Reverse violet rim',(-4,28,24),(0,3,-1.5),13000,(.73,.63,1),23,studio)
scene.camera=camera('Reverse hero',(47,-63,50),(0,3,-1.2),50,studio,ortho=67)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.cycles.max_bounces=5;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'underworld-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.35
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'underworld.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
# Also save a closer visual check of the duck, core and copper underground routes.
scene.camera=camera('Reverse detail',(20,-27,21),(0,1,-1),50,studio,ortho=34)
scene.render.resolution_x=1300;scene.render.resolution_y=950
scene.render.filepath=str(HERE/'underworld-detail.png')
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)

# Batched export, preserving the independent animation roots and six conveyor items.
dynamic={k.root,core,orbital,conveyor,duck,*items}
meshes=[o for o in subtree(k.root) if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.convert(target='MESH')
batches={}
for obj in meshes:
    anchor=obj.parent
    while anchor not in dynamic:anchor=anchor.parent
    batches.setdefault((anchor,obj.data.materials[0]),[]).append(obj)
for (anchor,mat),members in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:
        transform=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=transform;obj.select_set(True)
    bpy.context.view_layer.objects.active=members[0]
    if len(members)>1:bpy.ops.object.join()
    merged=bpy.context.view_layer.objects.active;transform=merged.matrix_world.copy()
    merged.parent=anchor;merged.matrix_world=transform;merged.name='Batch_'+anchor.name+'_'+mat.name.split('/')[-1].strip()
triangles=0
for obj in subtree(k.root):
    if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
bpy.ops.object.select_all(action='DESELECT')
for obj in subtree(k.root):obj.select_set(True)
bpy.context.view_layer.objects.active=k.root
target=OUT/'underworld.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_apply=True,
    export_animations=False,export_yup=True,export_texcoords=False,export_extras=True)
manifest={'source':'art/kroquetita-city-v01/dimensions/underworld.blend','assemblySource':native['source'],
 'space':'native world / metres / Y-up','layer':'lens-only','file':'/models/dimensions/underworld.glb',
 'bytes':target.stat().st_size,'triangles':triangles,'meshes':len(batches),'districts':districts,'hooks':hooks,
 'pivots':{'NeuralCore':[cx,-1.30,cz],'Ring':{'parent':'NeuralCore','position':[0,-.35,0]},
 'Conveyor':[fx,-2.25,fz+.9],'BobDuck':[px,-2.25,pz]},
 'conveyor':{'items':['Item_%02d'%(i+1) for i in range(6)],'minX':-4.2,'maxX':4.2,'axis':'local x'}}
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
assert target.stat().st_size<2000000,'Underworld exceeds 2 MB'
print('UNDERWORLD_COMPLETE',target.stat().st_size,triangles,len(batches),flush=True)
