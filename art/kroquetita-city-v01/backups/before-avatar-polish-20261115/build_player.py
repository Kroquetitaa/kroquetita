"""Restore Kroquetita's original mask and laptop on the Blender vinyl character.
Run with Blender --background --factory-startup --python build_player.py.
The web supplies the four original face expressions to the named UV screen.
"""
import bpy, sys, math
from pathlib import Path

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
    'hood':('#453c6e',.42), 'hood_light':('#5a4f8c',.48),
    'charcoal':('#252737',.5), 'cream':('#f6f2ea',.5),
    'orange':('#ff8a1e',.42), 'rubber':('#171921',.8),
    'metal':('#a6b5c3',.35), 'cyan':('#48d8d4',.4), 'pink':('#f2a2a2',.6),
}
mats = {name:material('AVATAR / '+name,color,rough) for name,(color,rough) in palette.items()}
root = build_avatar(mats,cube,cylinder,col)
for obj in list(col.objects):
    obj.animation_data_clear()
    # The old static face and cup cannot follow the original web controller.
    if obj.name.startswith(tuple('Avatar_'+n for n in ('Eye','Brow','Cheek','Nose','Moustache','Smile','Goatee','Coffee'))):
        bpy.data.objects.remove(obj,do_unlink=True)

head = bpy.data.objects['Head']
cube('Avatar_HoodTip',(0,.055,.34),(.18,.16,.10),mats['hood'],.022,head,col)

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
cube('LaptopBase',(0,0,0),(.43,.28,.035),mats['charcoal'],.012,laptop,col)
for row in range(3):
    for key in range(8):cube('LaptopKey',(-.15+key*.043,.075-row*.04,.023),(.033,.027,.007),mats['metal'],.002,laptop,col)
cube('LaptopTouchpad',(0,-.06,.021),(.10,.055,.006),mats['hood'],.003,laptop,col)
lid=bpy.data.objects.new('LaptopLid',None);col.objects.link(lid);lid.parent=laptop
lid.location=(0,-.12,.02);lid.rotation_euler.x=.22
cube('LaptopCover',(0,0,.13),(.43,.028,.26),mats['charcoal'],.012,lid,col)
points=[(.025,.23),(-.065,.12),(-.005,.12),(-.035,.035),(.07,.155),(.015,.155)]
mesh=bpy.data.meshes.new('Lightning');mesh.from_pydata([(x,-.017,z) for x,z in points],[],[tuple(range(len(points)))])
bolt=bpy.data.objects.new('LaptopLightning',mesh);col.objects.link(bolt);bolt.parent=lid
mesh.materials.append(material('AVATAR / laptop lightning','#ffd23a',.4,0,.6))

scene.unit_settings.system='METRIC'
scene.world.color=(.16,.18,.25)
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.camera=camera('Avatar inspection',(2,-4,2),(0,0,.55),50,col,ortho=1.8)
light('Avatar softbox',(-3,-4,5),(0,0,.6),500,(1,.9,.8),4,col)

# Export a neutral rig. Browser animation owns every joint; no baked Idle clip.
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:
    if obj.type not in ('CAMERA','LIGHT'):obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(HERE/'exports/avatar.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False)
face.data.materials[0]=preview
# Show the holding pose in Blender, but export neutral shoulder pivots above.
for name in ['Arm_L','Arm_R']:bpy.data.objects[name].rotation_euler.x=-1.15
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'districts/avatar.blend'),compress=True)
print('KROQUETITA_PLAYER_RESTORED',flush=True)
