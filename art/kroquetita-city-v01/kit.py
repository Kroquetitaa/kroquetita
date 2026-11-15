"""Shared, small-scale voxel/vinyl kit for the Kroquetita Blender city.
Blender coordinates: Z up, -Y forward. glTF exports: Y up, +Z forward.
"""
import bpy
import sys
import math
from pathlib import Path
from mathutils import Vector

PILOT = Path(__file__).resolve().parent.parent / 'kroquetita-lookdev-v01'
sys.path.insert(0, str(PILOT))
from build_scene import material, cube, cylinder, move_to, light, camera

COLORS = {
    'purple': ('#453c6e', .43, 0), 'lavender': ('#7463a4', .48, 0),
    'charcoal': ('#252737', .58, 0), 'rubber': ('#171921', .86, 0),
    'cream': ('#f4e4ca', .55, 0), 'orange': ('#ff8a1e', .4, .05),
    'cyan': ('#48d8d4', .38, .05), 'blue': ('#447dba', .5, .1),
    'green': ('#65ac88', .55, 0), 'pink': ('#d880ab', .48, 0),
    'red': ('#bd5359', .55, .05), 'gold': ('#cda55d', .45, .25),
    'metal': ('#a6b5c3', .34, .65), 'glass': ('#89c8d3', .2, .2),
    'paper': ('#e8d9ba', .88, 0), 'wood': ('#805f4e', .78, 0),
    'leaf': ('#438c7c', .7, 0), 'soil': ('#332a30', .93, 0),
    'slate': ('#37435b', .78, 0), 'light': ('#9ef3e8', .45, 0),
    'warm': ('#ffce8d', .48, 0),
}


def make_materials():
    return {key:material('CITY / '+key, color, rough, metal,
                .8 if key=='light' else .6 if key=='warm' else 0)
            for key,(color,rough,metal) in COLORS.items()}


class Kit:
    def __init__(self, name, mats):
        self.name = name
        self.mats = mats
        self.col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.col)
        self.root = bpy.data.objects.new(name+'_Root', None)
        self.col.objects.link(self.root)
        self.root.empty_display_size = .5
        self.root['module'] = name
        self.root['forward'] = '-Y in Blender / +Z in GLB'
        self.root['units'] = 'metres'

    def m(self, name):
        if isinstance(name, str):
            if name.startswith('#'):
                key = name.lower()
                if key not in self.mats:
                    self.mats[key] = material('CITY / '+key,key,.5)
                return self.mats[key]
            return self.mats[name]
        return name

    def empty(self, name, loc=(0,0,0), parent=None):
        obj = bpy.data.objects.new(name,None)
        self.col.objects.link(obj)
        obj.parent = parent if parent is not None else self.root
        obj.location = loc
        obj.empty_display_size = .15
        return obj

    def box(self,name,loc,size,mat,bevel=.03,parent=None):
        return cube(name,loc,size,self.m(mat),bevel,
                    parent if parent is not None else self.root,self.col)

    def cyl(self,name,loc,radius,depth,mat,vertices=16,rotation=None,parent=None):
        return cylinder(name,loc,radius,depth,self.m(mat),vertices,rotation,
                        parent if parent is not None else self.root,self.col)

    def ball(self,name,loc,radius,mat,subdivisions=1,parent=None):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=radius,location=loc)
        obj=bpy.context.object
        obj.name=name
        obj.data.materials.append(self.m(mat))
        move_to(obj,self.col)
        obj.parent=parent if parent is not None else self.root
        return obj

    def link(self,name,a,b,radius,mat,parent=None):
        a,b=Vector(a),Vector(b)
        obj=self.cyl(name,(a+b)*.5,radius,(b-a).length,mat,vertices=8,parent=parent)
        obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        return obj

    def text(self,name,words,loc,size,mat,parent=None):
        data=bpy.data.curves.new(name,'FONT')
        data.body=str(words)
        data.size=size
        data.align_x='CENTER'
        data.align_y='CENTER'
        data.extrude=0
        data.resolution_u=2
        obj=bpy.data.objects.new(name,data)
        self.col.objects.link(obj)
        obj.parent=parent if parent is not None else self.root
        obj.location=loc
        obj.rotation_euler.x=math.pi/2
        data.materials.append(self.m(mat))
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')
        return bpy.context.object

    def platform(self,size,accent='orange'):
        w,d=size
        self.root['footprint_blender_xy']=list(size)
        self.box('Foundation',(0,0,-.23),(w+.12,d+.12,.40),'charcoal',.10)
        self.box('District seam',(0,0,-.34),(w+.14,d+.14,.04),accent,.015)
        self.box('Satin floor',(0,0,-.02),(w,d,.04),'slate',.018)
        # Modular joints without dozens of separate tile meshes.
        for ix in range(-int(w/2)+1,int(w/2)):
            self.box('Floor joint',(ix,0,.001),(.016,d-.06,.004),'charcoal',0)
        for iy in range(-int(d/2)+1,int(d/2)):
            self.box('Floor joint',(0,iy,.001),(w-.06,.016,.004),'charcoal',0)

    def hook(self,name,loc,role):
        obj=self.empty(name,loc)
        obj['interaction']=role
        return obj


def subtree(root):
    out=[root]
    for child in root.children:
        out.extend(subtree(child))
    return out


def freeze_clip(obj, name):
    """Group an object's keyed action in a named NLA export clip."""
    ad=obj.animation_data
    if not ad or not ad.action:
        return
    action=ad.action
    slot=getattr(ad,'action_slot',None)
    action.name=name+'_'+obj.name
    track=ad.nla_tracks.new()
    track.name=name
    strip=track.strips.new(name,int(action.frame_range[0]),action)
    if slot is not None and hasattr(strip,'action_slot'):
        strip.action_slot=slot
    strip.extrapolation='HOLD'
    ad.action=None
