"""THE CORE origin: five cosmic toy islands aligned to the native city districts."""
import bpy,sys,math,json,re
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;CITY=HERE.parent;PROJECT=CITY.parent.parent
sys.path.insert(0,str(CITY))
from kit import Kit,material,light,camera,subtree
source=(PROJECT/'src/world/blenderAssembly.ts').read_text(encoding='utf-8')
native=json.loads(re.search(r'export const blenderAssembly = (\{[\s\S]*\}) as const',source).group(1))
OUT=PROJECT/'public/models/dimensions';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
palette={'violet':('#69508d',.42,.04,0),'deep':('#38375b',.55,.08,0),
 'coral':('#d89b9d',.40,0,0),'cream':('#f3e1c6',.35,0,0),
 'gold':('#e8bc6b',.31,.30,.15),'signal':('#ffcfa6',.35,.04,.85),
 'lilac':('#b9a4da',.38,.06,0),'teal':('#8fc6c8',.38,.12,0),
 'mint':('#baeee0',.37,.02,.6),'ink':('#393248',.65,0,0),'beak':('#e4a16b',.40,0,0)}
mats={name:material('ORIGIN / '+name,*values) for name,values in palette.items()}
for name,mat in mats.items():
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Coat Weight'].default_value=.14
    shader.inputs['Coat Roughness'].default_value=.28
k=Kit('Origin',mats);k.root.name='Origin';k.root['layer']='lens-level-2'
k.root['assembly_source']=native['source']
def at(p):return (p[0],-p[2],p[1])
def group(name,p=(0,0,0),parent=None):return k.empty(name,at(p),parent)
def box(name,p,s,m,parent=None,bevel=.06,segments=1):
    obj=k.box(name,at(p),(s[0],s[2],s[1]),m,min(bevel,min(s)*.35),parent)
    for mod in obj.modifiers:
        if mod.type=='BEVEL':mod.segments=segments
    return obj
def ball(name,p,r,m,parent=None,sub=2,smooth=False):
    obj=k.ball(name,at(p),r,m,sub,parent)
    if smooth:
        for polygon in obj.data.polygons:polygon.use_smooth=True
    return obj
def cyl(name,p,r,h,m,parent=None,vertices=24):
    obj=k.cyl(name,at(p),r,h,m,vertices=vertices,parent=parent)
    for mod in list(obj.modifiers):
        if mod.type=='BEVEL':mod.segments=1
    return obj
def pipe(name,points,r=.06,m='gold',parent=None,closed=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.bevel_depth=r;curve.bevel_resolution=1;curve.resolution_u=5
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,p in zip(spline.bezier_points,points):
        point.co=at(p);point.handle_left_type='AUTO';point.handle_right_type='AUTO'
    spline.use_cyclic_u=closed
    obj=bpy.data.objects.new(name,curve);k.col.objects.link(obj);obj.parent=parent or k.root
    curve.materials.append(k.m(m))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');return obj
def ring(name,p,radius,wire,m,parent=None):
    return pipe(name,[(p[0]+math.cos(a)*radius,p[1],p[2]+math.sin(a)*radius)
        for a in [i*math.tau/12 for i in range(12)]],wire,m,parent,True)
def label(name,words,p,size=.36,m='cream'):return k.text(name,words,at(p),size,m)
def island(name,x,z,radius,y=-3.25):
    stone=ball(name+' floating crust',(x,y-.72,z),1,'coral',sub=2)
    stone.scale=(radius,radius*.72,1.10)
    cyl(name+' island rim',(x,y,z),radius,.28,'gold',vertices=32)
    cyl(name+' lilac soil',(x,y+.16,z),radius-.12,.12,'violet',vertices=32)
    ring(name+' aura',(x,y+.24,z),radius-.27,.045,'mint')
    for i in range(5):
        a=i*math.tau/5
        pebble=ball(name+' orbiting crumb',(x+math.cos(a)*(radius+.42),y-.6+(i%2)*.3,z+math.sin(a)*(radius+.42)),.25,'gold',sub=1)
        pebble.scale=(1.3,1,.7)
    return y+.22
cx,_,cz=native['hooks']['Hook_Career_CoreFocus']
px,_,pz=native['districts']['plaza']['position']
fx,_,fz=native['districts']['factory']['position']
lx,_,lz=native['districts']['library']['position']
hx,_,hz=native['districts']['hangar']['position']
island('Seed',cx,cz,4.5,-3.5)
island('Oracle',px,pz,3.5,-3.0)
island('Infinite',fx,fz,4.2,-3.25)
island('Memory',lx,lz,4.3,-3.25)
island('Thought',hx,hz,4.1,-3.25)

# A giant neural seed and two orbital hoops establish a different visual language from the basement.
seed=group('OriginSeed',(cx,0,cz))
pod=ball('First neural seed',(0,0,0),2.0,'coral',seed,3,True);pod.scale=(.90,.85,1.40)
inner=ball('Seed golden heart',(0,.30,1.42),.68,'gold',seed,2,True)
for sign in (-1,1):
    for row in range(3):
        points=[]
        for j in range(10):
            t=j/9
            points.append((sign*(.20+1.38*t),-1.45+row*1.25+.25*math.sin(t*math.pi),
                           1.73*math.sqrt(max(.06,1-(.1+.75*t)**2-((-.7+row*.5)/1.4)**2))))
        pipe('Neural seed vein',points,.042,'mint' if row==1 else 'gold',seed)
        ball('Seed synapse',points[-1],.15,'signal',seed,2)
orbit=group('OriginRing',(0,0,0),seed)
pipe('Origin orbit A',[(math.cos(a)*3.45,math.sin(a)*.85,math.sin(a)*2.55)
    for a in [i*math.tau/16 for i in range(16)]],.070,'signal',orbit,True)
pipe('Origin orbit B',[(math.cos(a)*2.80,math.sin(a)*2.50,math.sin(a)*1.25)
    for a in [i*math.tau/16 for i in range(16)]],.055,'gold',orbit,True)
for i in range(6):
    a=i*math.tau/6
    ball('Orbit idea',(math.cos(a)*3.45,math.sin(a)*.85,math.sin(a)*2.55),.24,'mint' if i%2 else 'cream',orbit,2)
label('Origin seed name','ANTES DE LA PRIMERA IDEA',(cx,-2.93,cz+4.2),.40)

# The oracle is an enormous ivory egg with a duck's face and a floating crown.
oracle=group('OracleEgg',(px,-2.70,pz))
egg=ball('Oracle ivory egg',(0,1.92,0),1.60,'cream',oracle,3,True);egg.scale=(1,.85,1.20)
box('Oracle duck mask',(0,2.35,1.25),(1.75,1.12,.33),'gold',oracle,.15,2)
box('Oracle beak',(0,2.10,1.70),(1.10,.30,.72),'beak',oracle,.09,2)
for sign in (-1,1):
    box('Oracle eye white',(sign*.44,2.64,1.45),(.36,.43,.09),'cream',oracle,.05,2)
    box('Oracle pupil',(sign*.44,2.64,1.51),(.17,.26,.045),'ink',oracle,.025,2)
    box('Oracle eye star',(sign*.44-.035,2.72,1.54),(.07,.075,.02),'signal',oracle,.01)
    box('Oracle wing',(sign*1.50,1.75,-.04),(.20,.70,1.10),'lilac',oracle,.08,2)
ring('Oracle crown',(0,4.0,0),1.05,.065,'gold',oracle)
for i in range(5):
    a=i*math.tau/5
    ball('Oracle crown gem',(math.cos(a)*1.05,4.02,math.sin(a)*1.05),.17,'mint',oracle,2)
ball('Oracle answer',(0,4.55,0),.27,'signal',oracle,2)
for radius in (1.9,2.3,2.75):ring('Oracle answer ripple',(px,-2.69,pz),radius,.025,'signal')
label('Oracle name','EL ORACULO DICE: CUAC',(px,-2.47,pz+3.32),.34,'signal')

# Infinite croquettes orbit a literal, sculpted infinity curve.
croquettes=group('CroquetteOrbit',(fx,-.3,fz))
points=[]
for i in range(32):
    t=i*math.tau/32
    points.append((fx+2.9*math.cos(t),-.15+.25*math.sin(t),fz+1.35*math.sin(t*2)))
pipe('Infinite recipe',points,.12,'gold',closed=True)
for i in range(8):
    a=i*math.tau/8
    item=group('OriginCroquette_%02d'%i,(math.cos(a)*3.1,.35*math.sin(a*2),math.sin(a)*2.1),croquettes)
    box('Orbit croquette',(0,0,0),(1.10,.62,.72),'gold',item,.18,2)
    for x in (-.19,.19):box('Croquette eye',(x,.06,.366),(.075,.12,.025),'ink',item,.012)
    box('Croquette smile',(0,-.13,.368),(.20,.025,.02),'beak',item,.005)
    for j in range(3):ball('Golden crumb',(-.3+j*.3,.33,.05*(j%2)),.075,'cream',item,1)
label('Infinite feast label','LA CROQUETA ES INFINITA',(fx,-2.75,fz+3.92),.36)

# Memory becomes a coral tree of floating books, rooted in the original library position.
pipe('Memory trunk',[(lx,-2.95,lz),(lx-.3,-1.65,lz),(lx+.2,-.3,lz),(lx,1.05,lz)],.24,'coral')
pipe('Memory golden braid',[(lx+.25,-2.9,lz),(lx-.3,-1.7,lz+.2),(lx+.4,-.2,lz),(lx,1.1,lz+.1)],.07,'gold')
for i in range(7):
    a=i*math.tau/7
    p=(lx+math.cos(a)*2.30,.25+(i%3)*.55,lz+math.sin(a)*1.75)
    pipe('Memory branch',[(lx,-1.4,lz),(lx+math.cos(a),-.1,lz+math.sin(a)*.7),p],.075,'gold')
    book=group('Dream book',p)
    box('Book pages',(0,0,0),(.88,.20,.70),'cream',book,.04)
    box('Book cover',(0,.14,0),(1.0,.06,.78),['teal','lilac','coral'][i%3],book,.02)
    box('Book lower cover',(0,-.14,0),(1.0,.06,.78),'gold',book,.02)
    box('Book luminous index',(0,0,.36),(.60,.055,.025),'mint',book,.008)
label('Memory dream name','LOS RECUERDOS CRECEN',(lx,-2.75,lz+4.0),.37)

# The secret hangar's origin is a huge folded paper idea, above a compass of possibilities.
ship=group('ThoughtShip',(hx,-.15,hz))
verts=[at(p) for p in ((-2.2,0,-1.5),(0,.55,2.25),(2.2,0,-1.5),(0,-.2,-.55),(0,.45,-1.25))]
faces=[(0,1,4),(4,1,2),(0,3,1),(1,3,2),(0,4,3),(4,2,3)]
mesh=bpy.data.meshes.new('Folded possibility');mesh.from_pydata(verts,[],faces);mesh.materials.append(mats['cream'])
plane=bpy.data.objects.new('Paper idea',mesh);k.col.objects.link(plane);plane.parent=ship
pipe('Paper crease',[(0,.46,-1.25),(0,.55,2.25)],.035,'gold',ship)
ring('Possibility compass',(hx,-2.84,hz),2.65,.07,'signal')
for i in range(8):
    a=i*math.tau/8
    marker=box('Compass marker',(hx+math.cos(a)*3,-2.80,hz+math.sin(a)*3),(.18,.08,.52),'gold')
    marker.rotation_euler.z=-a
for i in range(3):
    p=(hx-2+i*1.8,-.9+i*.45,hz-2.2)
    ball('Thought star',p,.19,'mint',sub=1)
pipe('Paper contrail',[(hx,-.35,hz-1),(hx-1,-.6,hz-2.3),(hx-3,-.9,hz-3),(hx-4,-1.2,hz-2.4)],.055,'signal')
label('Thought label','IDEAS SIN GRAVEDAD',(hx,-2.75,hz+3.85),.38)

# Soft translucent coral/violet planes sit behind the five islands, without a solid city floor.
for index,(x,z,rx,rz) in enumerate(((0,-7,11,8),(-16,0,10,13),(16,7,10,10))):
    mat=material('ORIGIN / Nebula %d'%index,'#7d689b' if index%2==0 else '#d59dba',.9,0,.12)
    mat.diffuse_color=(*mat.diffuse_color[:3],.04)
    mat.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.04
    mat.surface_render_method='DITHERED';k.mats['nebula%d'%index]=mat
    cloud=ball('Nebula plane',(x,-5.2-index*.12,z),1,'nebula%d'%index,sub=3,smooth=True)
    cloud.scale=(rx,rz,.22)
for a,b in (((cx,-2.8,cz),(px,-2.5,pz)),((px,-2.5,pz),(fx,-2.8,fz)),
            ((cx,-2.8,cz),(lx,-2.8,lz)),((px,-2.5,pz),(hx,-2.8,hz))):
    mid=((a[0]+b[0])/2,-2.0,(a[2]+b[2])/2)
    pipe('Dream thread',[a,mid,b],.045,'mint')
hooks={'Hook_Origin_Core':[cx,1,cz],'Hook_Origin_Oracle':[px,.1,pz],'Hook_Origin_Infinite':[fx,-.4,fz],
       'Hook_Origin_Memory':[lx,.3,lz],'Hook_Origin_Thought':[hx,-.15,hz],
       'Hook_Origin_Actor_A':[hx-2.5,-3.02,hz+1.5],'Hook_Origin_Actor_B':[fx-2.2,-3.02,fz+1.8],
       'Hook_Origin_Actor_C':[lx+2.5,-3.02,lz+1.4]}
for name,p in hooks.items():group(name,p)
studio=bpy.data.collections.new('Origin studio');bpy.context.scene.collection.children.link(studio)
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Origin world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.030,.10,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
light('Origin peach key',(-19,-23,30),(0,2,0),13000,(1,.78,.66),24,studio)
light('Origin lilac fill',(25,-4,20),(0,2,0),11000,(.71,.69,1),22,studio)
light('Origin coral rim',(-4,24,24),(0,2,0),12000,(1,.65,.74),23,studio)
scene.camera=camera('Origin hero',(44,-59,44),(0,1,-.5),50,studio,ortho=63)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.cycles.max_bounces=5;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'origin-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.35
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'origin.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
dynamic={k.root,seed,orbit,oracle,croquettes,ship}
meshes=[o for o in subtree(k.root) if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
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
    merged=bpy.context.view_layer.objects.active;transform=merged.matrix_world.copy();merged.parent=anchor;merged.matrix_world=transform
    merged.name='Batch_'+anchor.name+'_'+mat.name.split('/')[-1].strip()
triangles=0
for obj in subtree(k.root):
    if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
bpy.ops.object.select_all(action='DESELECT')
for obj in subtree(k.root):obj.select_set(True)
bpy.context.view_layer.objects.active=k.root
target=OUT/'origin.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_apply=True,
 export_animations=False,export_yup=True,export_texcoords=False,export_extras=True)
manifest={'file':'/models/dimensions/origin.glb','source':'art/kroquetita-city-v01/dimensions/origin.blend',
 'assemblySource':native['source'],'space':'native world / metres / Y-up','layer':'lens-level-2',
 'bytes':target.stat().st_size,'triangles':triangles,'meshes':len(batches),'hooks':hooks,
 'pivots':{'OriginSeed':[cx,0,cz],'OriginRing':{'parent':'OriginSeed','position':[0,0,0]},
 'OracleEgg':[px,-2.7,pz],'CroquetteOrbit':[fx,-.3,fz],'ThoughtShip':[hx,-.15,hz]}}
(HERE/'origin-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'origin-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
combined=target.stat().st_size+(OUT/'underworld.glb').stat().st_size
assert combined<3000000,'Both layers exceed 3 MB'
print('ORIGIN_COMPLETE',target.stat().st_size,triangles,len(batches),'COMBINED',combined,flush=True)
