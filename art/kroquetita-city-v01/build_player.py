"""Build the polished, playable Kroquetita vinyl character.
Run with Blender --background --threads 4 --factory-startup --python build_player.py.
The GLB stays neutral and untextured; the web owns the original face expressions.
The editable Blender file and studio render show the original mask and holding pose.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'kroquetita-lookdev-v01'))
from build_scene import material, cube, cylinder, light, camera
from avatar import build_avatar

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
col = bpy.data.collections.new('Kroquetita / playable avatar')
scene.collection.children.link(col)
palette = {
    'hood':('#453c6e',.4), 'hood_light':('#655795',.43),
    'charcoal':('#252737',.5), 'cream':('#f6f2ea',.5),
    'orange':('#ff8a1e',.42), 'rubber':('#171921',.8),
    'metal':('#a6b5c3',.35), 'cyan':('#48d8d4',.4), 'pink':('#f2a2a2',.6),
}
mats = {name:material('AVATAR / '+name,color,rough) for name,(color,rough) in palette.items()}
mats.update({
    'stitch': material('AVATAR / lilac stitching','#9b8bb9',.58),
    'lining': material('AVATAR / hood lining','#302646',.55),
    'shoe': material('AVATAR / violet sneaker upper','#38344e',.48),
    'sole': material('AVATAR / warm rubber sole','#d4cbdc',.65),
    'alloy': material('AVATAR / satin aluminium','#8b8fa7',.29,.72),
    'dark_metal': material('AVATAR / anodised graphite','#303240',.31,.58),
    'screen': material('AVATAR / laptop display','#111525',.32,.12),
    'screen_ink': material('AVATAR / display cyan','#65e3d9',.38,0,.45),
})
root = build_avatar(mats,cube,cylinder,col)
for obj in list(col.objects):
    obj.animation_data_clear()
    # The old static face and cup cannot follow the original web controller.
    if obj.name.startswith(tuple('Avatar_'+n for n in ('Eye','Brow','Cheek','Nose','Moustache','Smile','Goatee','Coffee'))):
        bpy.data.objects.remove(obj,do_unlink=True)

head = bpy.data.objects['Head']
cube('Avatar_HoodTip',(0,.055,.34),(.18,.16,.10),mats['hood'],.022,head,col)
body = bpy.data.objects['Body']

def detail(name,parent,at,size,mat='hood',bevel=.003,rotation=None):
    obj=cube('Avatar_'+name,at,size,mats[mat],bevel,parent,col)
    if rotation: obj.rotation_euler=rotation
    return obj

def tube(name,parent,points,radius,mat='stitch',sides=6):
    """Small real geometry seams, exported unchanged instead of shader-only detail."""
    points=[Vector(p) for p in points]
    verts=[];faces=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        axis=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
        for k in range(sides):
            angle=math.tau*k/sides
            verts.append(tuple(p+radius*(u*math.cos(angle)+v*math.sin(angle))))
    for i in range(len(points)-1):
        for k in range(sides):
            a=i*sides+k;b=i*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+k for k in range(sides))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mats[mat])
    obj=bpy.data.objects.new('Avatar_'+name,mesh);col.objects.link(obj);obj.parent=parent
    for polygon in mesh.polygons: polygon.use_smooth=True
    return obj

# The same square silhouette, with a layered hood and a framed original mask.
# All frame edges lie outside FaceScreen's immutable .293 x .252 UV rectangle.
for side,sign in [('L',-1),('R',1)]:
    detail('MaskBezel_'+side,head,(sign*.162,-.218,.105),(.022,.030,.282),'lining',.007)
    tube('HoodPiping_'+side,head,[(sign*.181,-.202,-.022),(sign*.193,-.202,.025),(sign*.193,-.202,.210),(sign*.169,-.200,.260)],.004,'hood_light')
    tube('HoodSideSeam_'+side,head,[(sign*.216,.095,.030),(sign*.219,.098,.180),(sign*.194,.095,.277)],.0023,'stitch')
detail('MaskBezelTop',head,(0,-.219,.245),(.316,.030,.018),'lining',.006)
detail('MaskBezelBottom',head,(0,-.218,-.035),(.316,.030,.018),'lining',.006)
tube('HoodCrownSeam',head,[(0,-.092,.324),(0,.05,.327),(0,.140,.302),(0,.186,.240),(0,.189,.09)],.0024,'stitch')
detail('HoodBackFold',head,(0,.183,.03),(.30,.025,.055),'hood_light',.011)

# Raised collar, an actual folded pocket and a handful of readable garment seams.
for side,sign in [('L',-1),('R',1)]:
    detail('CollarFold_'+side,body,(sign*.085,-.105,.354),(.112,.065,.044),'hood',.010,(0,sign*.12,sign*.2))
    detail('CordEyelet_'+side,body,(sign*.041,-.143,.302),(.024,.009,.023),'alloy',.006)
    tube('ShoulderSeam_'+side,body,[(sign*.10,-.124,.352),(sign*.145,-.127,.318),(sign*.172,-.118,.273)],.0021)
    detail('PocketOpening_'+side,body,(sign*.083,-.157,.113),(.008,.008,.052),'lining',.002,(0,sign*.35,0))
    tube('PocketStitch_'+side,body,[(sign*.091,-.157,.135),(sign*.106,-.156,.106),(sign*.092,-.156,.071)],.0018)
tube('PocketBottomStitch',body,[(-.088,-.157,.069),(0,-.158,.064),(.088,-.157,.069)],.0018)
detail('PocketLabel',body,(.069,-.160,.077),(.026,.005,.021),'orange',.002)
detail('PocketLabelMark',body,(.069,-.164,.079),(.014,.002,.004),'cream',.0005)
for i in range(17):
    detail('HemRib_%02d'%i,body,(-.160+i*.02,-.138,.003),(.004,.003,.036),'hood_light',.001)

for side,sign in [('L',-1),('R',1)]:
    arm=bpy.data.objects['Arm_'+side]
    leg=bpy.data.objects['Leg_'+side]
    tube('SleeveSeam_'+side,arm,[(sign*.060,-.070,.004),(sign*.067,-.073,-.075),(sign*.067,-.071,-.154)],.0021)
    for i in range(5):
        detail('CuffRib_'+side+str(i),arm,(-.034+i*.022,-.097,-.186),(.004,.004,.024),'hood_light',.001)
    # The original thumbs are retained; a tiny join crease reads as a toy hand.
    tube('ThumbCrease_'+side,arm,[(-sign*.023,-.069,-.215),(-sign*.023,-.071,-.235)],.0014,'sole')
    tube('TrouserSeam_'+side,leg,[(sign*.060,-.03,-.018),(sign*.060,-.034,-.135),(sign*.060,-.033,-.201)],.0017,'hood_light')
    detail('TrouserTurnup_'+side,leg,(0,-.001,-.197),(.120,.152,.035),'charcoal',.007)

    # Layered trainers: pale midsole, dark tread, a violet upper and orange heel.
    bpy.data.objects['Avatar_Boot_'+side].data.materials[0]=mats['shoe']
    bpy.data.objects['Avatar_Sole_'+side].data.materials[0]=mats['sole']
    detail('ShoeMidsole_'+side,leg,(0,-.043,-.269),(.140,.234,.019),'sole',.005)
    detail('ShoeTread_'+side,leg,(0,-.043,-.298),(.136,.229,.006),'rubber',.002)
    detail('ShoeToe_'+side,leg,(0,-.136,-.239),(.132,.039,.055),'hood_light',.011)
    detail('ShoeTongue_'+side,leg,(0,-.059,-.181),(.071,.101,.015),'hood',.005)
    detail('ShoeHeel_'+side,leg,(0,.068,-.228),(.093,.015,.052),'orange',.006)
    detail('ShoePullTab_'+side,leg,(0,.072,-.192),(.024,.018,.036),'orange',.004)
    for row in range(3):
        y=-.037-row*.028
        for sign_x in [-1,1]:
            detail('ShoeEyelet_'+side+str(row)+str(sign_x),leg,(sign_x*.035,y,-.182),(.013,.015,.008),'alloy',.004)
        tube('ShoeLace_'+side+str(row),leg,[(-.031,y,-.176),(0,y-.004,-.171),(.031,y-.007,-.176)],.0032,'cream')
    for notch in range(4):
        detail('TreadNotch_'+side+str(notch),leg,(sign*.070,-.115+notch*.052,-.284),(.002,.009,.012),'rubber',.0006)

root['lookdev']='vinyl-voxel-polished-v02'
root['animation_owner']='Web controller; neutral pivots, no exported animation clips'

def plane(name, parent, position, width, height, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(-width/2,0,-height/2),(width/2,0,-height/2),(width/2,0,height/2),(-width/2,0,height/2)],[],[(0,1,2,3)])
    uv=mesh.uv_layers.new(name='UVMap')
    for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]): loop.uv=coord
    obj=bpy.data.objects.new(name,mesh);col.objects.link(obj)
    obj.parent=parent;obj.location=position;obj.data.materials.append(mat)
    return obj

face = plane('FaceScreen',head,(0,-.219,.105),.293,.252,mats['cream'])
face['web_material']='Original expressive mask: normal / blink / wow / happy'

# Pack the original mask into the editable Blender file as a preview. The GLB
# carries the same UV surface, with its expression supplied by the web at runtime.
pixels=[(0,0,0,0)]*(32*32)
def px(color,x,y,w=1,h=1):
    rgb=tuple(int(color[n:n+2],16)/255 for n in (1,3,5))+(1,)
    for yy in range(y,y+h):
        for xx in range(x,x+w): pixels[(31-yy)*32+xx]=rgb
ink='#16121c'
px('#f6f2ea',0,0,32,32)
for args in [(0,0,2,2),(30,0,2,2),(0,25,2,7),(30,25,2,7),(2,28,3,4),(27,28,3,4),(5,30,4,2),(23,30,4,2)]:px('#453c6e',*args)
for args in [(6,7,7,1),(5,8,2,1),(19,7,7,1),(25,8,2,1),(7,10,6,3),(19,10,6,3),(11,19,10,1),(9,18,2,1),(8,17,1,1),(21,18,2,1),(23,17,1,1),(10,22,12,1),(9,21,1,1),(22,21,1,1),(15,25,2,5)]:px(ink,*args)
px('#d6cec0',15,13,2,5);px('#f2a2a2',3,16,5,3);px('#f2a2a2',24,16,5,3)
for x in [7,12,19,24]:px('#f6f2ea',x,12)
image=bpy.data.images.new('Kroquetita original mask',width=32,height=32,alpha=True)
image.pixels[:]=[c for pixel in pixels for c in pixel]
image.pack()
preview=material('AVATAR / original mask preview','#ffffff',.65)
texture=preview.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Closest'
preview.node_tree.links.new(texture.outputs['Color'],preview.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

laptop=bpy.data.objects.new('Laptop',None);col.objects.link(laptop)
laptop.parent=root;laptop.location=(0,-.29,.51)
cube('LaptopBase',(0,0,0),(.43,.28,.035),mats['dark_metal'],.012,laptop,col)
cube('LaptopPalmDeck',(0,0,.017),(.412,.260,.008),mats['alloy'],.007,laptop,col)
cube('LaptopKeyboardWell',(0,.033,.023),(.371,.124,.004),mats['rubber'],.004,laptop,col)
for row in range(3):
    for key in range(8):cube('LaptopKey',(-.15+key*.043,.075-row*.04,.028),(.033,.027,.007),mats['charcoal'],.002,laptop,col)
cube('LaptopSpacebar',(0,-.026,.028),(.135,.015,.006),mats['charcoal'],.002,laptop,col)
cube('LaptopTouchpad',(0,-.072,.023),(.115,.055,.003),mats['dark_metal'],.003,laptop,col)
cube('LaptopTouchpadInset',(0,-.072,.025),(.108,.049,.001),mats['alloy'],.002,laptop,col)
for side,sign in [('L',-1),('R',1)]:
    for index,y in enumerate([-.064,.004,.059]):
        cube('LaptopPort_'+side+str(index),(sign*.215,y,.001),(.002,.028,.009),mats['rubber'],.002,laptop,col)
    cube('LaptopFoot_'+side,(sign*.153,.073,-.019),(.041,.024,.007),mats['rubber'],.003,laptop,col)
    cylinder('LaptopHinge_'+side,(sign*.155,-.119,.020),.018,.052,mats['alloy'],16,(0,math.pi/2,0),laptop,col)
cube('LaptopPowerLED',(.190,.085,.027),(.007,.012,.003),mats['screen_ink'],.002,laptop,col)
lid=bpy.data.objects.new('LaptopLid',None);col.objects.link(lid);lid.parent=laptop
lid.location=(0,-.12,.02);lid.rotation_euler.x=.22
cube('LaptopCover',(0,0,.13),(.43,.028,.26),mats['dark_metal'],.012,lid,col)
cube('LaptopInnerBezel',(0,.016,.14),(.396,.007,.222),mats['rubber'],.008,lid,col)
cube('LaptopDisplay',(0,.021,.14),(.368,.003,.191),mats['screen'],.004,lid,col)
cube('LaptopCamera',(0,.022,.245),(.007,.003,.006),mats['metal'],.002,lid,col)
# A small code editor on the inside: geometry, so it survives glTF unchanged.
cube('LaptopEditorSidebar',(-.147,.024,.139),(.043,.001,.167),mats['hood'],.001,lid,col)
for i,(width,x) in enumerate([(.116,-.055),(.08,-.037),(.148,-.037),(.10,-.020),(.065,-.019),(.122,-.036)]):
    cube('LaptopCodeLine'+str(i),(x,.024,.203-i*.022),(width,.001,.005),mats['screen_ink'] if i%3 else mats['orange'],.001,lid,col)
points=[(.025,.23),(-.065,.12),(-.005,.12),(-.035,.035),(.07,.155),(.015,.155)]
mesh=bpy.data.meshes.new('Lightning');mesh.from_pydata([(x,-.017,z) for x,z in points],[],[tuple(range(len(points)))])
bolt=bpy.data.objects.new('LaptopLightning',mesh);col.objects.link(bolt);bolt.parent=lid
mesh.materials.append(material('AVATAR / laptop lightning','#ffd23a',.4,0,.6))

# Export a neutral rig. Browser animation owns every joint; no baked Idle clip.
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:
    if obj.type not in ('CAMERA','LIGHT'):obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(HERE/'exports/avatar.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False)
depsgraph=bpy.context.evaluated_depsgraph_get()
triangles=0
for obj in col.objects:
    if obj.type!='MESH':continue
    evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    triangles+=len(mesh.loop_triangles);evaluated.to_mesh_clear()

face.data.materials[0]=preview
# Show the holding pose in Blender, but export neutral shoulder pivots above.
for name in ['Arm_L','Arm_R']:bpy.data.objects[name].rotation_euler.x=-1.15
scene.unit_settings.system='METRIC'
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.17,.13,.23,1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.35
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
studio=bpy.data.collections.new('STUDIO / preview only - excluded from GLB')
scene.collection.children.link(studio)
floor=material('STUDIO / lavender backdrop','#53445f',.76)
cube('STUDIO ground',(0,0,-.026),(200,200,.050),floor,0,None,studio)
scene.camera=camera('Avatar inspection',(2.2,-5.7,2.5),(0,-.045,.56),60,studio,ortho=1.48)
light('STUDIO warm key',(-2.0,-3.8,4.0),(0,0,.55),390,(1.0,.87,.76),3.5,studio)
light('STUDIO lavender fill',(3,-1.5,2.6),(0,0,.55),230,(.75,.82,1.0),2.8,studio)
light('STUDIO cool rim',(1.0,2.0,3.0),(0,0,.7),470,(.76,.83,1.0),2.5,studio)
light('STUDIO front strip',(-.8,-2,.7),(0,0,.6),35,(1.0,.83,.64),1.2,studio)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'districts/avatar.blend'),compress=True)
(HERE/'renderpreview').mkdir(exist_ok=True)
scene.render.filepath=str(HERE/'renderpreview/avatar-polished.png')
bpy.ops.render.render(write_still=True)
print('KROQUETITA_PLAYER_POLISHED '+json.dumps({'triangles':triangles,'meshes':len([o for o in col.objects if o.type=='MESH']),'glbBytes':(HERE/'exports/avatar.glb').stat().st_size,'render':scene.render.filepath}),flush=True)
