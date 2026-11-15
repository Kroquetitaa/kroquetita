"""Reproducible Blender pilot. Run in a separate background Blender process.

All generated files stay beside this script. The running interactive Blender
session, application preferences, and the website source are never touched.
"""
import bpy
import sys
import math
import json
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
VERSION = 'v02'
sys.path.insert(0, str(HERE))
from avatar import build_avatar
from validate_assets import finalize_exports


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to(obj, col):
    if col:
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        col.objects.link(obj)


def linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, color, roughness=.5, metalness=0, emission=0):
    rgb = tuple(linear(int(color[i:i+2], 16) / 255) for i in (1, 3, 5))
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return m


def finish(obj, name, mat, parent, col, bevel=0):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    move_to(obj, col)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new('Small manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.harden_normals = True
        for p in obj.data.polygons:
            p.use_smooth = True
        n = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
        n.weight = 50
    return obj


def cube(name, loc, size, material, bevel=.02, parent=None, collection=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, parent, collection, bevel)


def cylinder(name, loc, radius, depth, material, vertices=24, rotation=None, parent=None, collection=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, material, parent, collection, min(.012, depth * .14))


def empty(name, col, parent=None):
    obj = bpy.data.objects.new(name, None)
    col.objects.link(obj)
    obj.parent = parent
    obj.empty_display_size = .15
    return obj


def label(name, words, loc, size, mat, col, parent=None, align='CENTER'):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = words
    data.size = size
    data.align_x = align
    data.align_y = 'CENTER'
    data.extrude = .0008
    data.bevel_depth = .0003
    data.bevel_resolution = 1
    data.resolution_u = 4
    font = Path('C:/Windows/Fonts/bahnschrift.ttf')
    if font.exists():
        data.font = bpy.data.fonts.get('Bahnschrift') or bpy.data.fonts.load(str(font))
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler.x = math.pi / 2
    obj.parent = parent
    data.materials.append(mat)
    # Mesh labels survive GLB export without depending on system fonts.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def light(name, loc, target, energy, color, size, col, shape='DISK', size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = shape
    data.size = size
    if size_y and shape == 'RECTANGLE':
        data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def camera(name, loc, target, lens, col, ortho=0):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.lens = lens
    if ortho:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    return obj


def build():
    # This script runs only in a fresh background process.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.frame_start, scene.frame_end = 1, 96
    scene.render.fps = 24
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1120
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.view_settings.view_transform = 'AgX'
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.10, .14, .22, 1)
    bg.inputs['Strength'].default_value = .25

    mat = {
        'hood': material('KQ / purple vinyl', '#453c6e', .4),
        'hood_light': material('KQ / lavender vinyl', '#7463a4', .45),
        'charcoal': material('KQ / graphite polymer', '#252737', .52),
        'cream': material('KQ / warm porcelain', '#f4e4ca', .4),
        'orange': material('KQ / orange enamel', '#ff8a1e', .36),
        'rubber': material('KQ / rubber', '#171921', .82),
        'metal': material('KQ / brushed aluminium', '#a6b5c3', .32, .7),
        'cyan': material('KQ / cyan accent', '#48d8d4', .32, .05, .4),
        'pink': material('KQ / cheek pink', '#e58c9a', .65),
        'tile_a': material('KQ / blue slate satin', '#37435b', .76),
        'tile_b': material('KQ / blue slate variant', '#3c4b64', .73),
        'stone': material('KQ / chalk stone', '#969daf', .8),
        'coffee': material('KQ / espresso', '#361d15', .25),
        'screen': material('KQ / display charcoal', '#112a36', .3),
        'screen_text': material('KQ / display mint', '#91f7d9', .4, 0, 1.1),
        'lamp': material('KQ / warm light diffuser', '#ffce8d', .45, 0, 1.8),
        'leaf': material('KQ / jade green', '#438c7c', .65),
        'leaf_light': material('KQ / leaf pale green', '#70b499', .68),
        'soil': material('KQ / soil', '#332a30', .9),
        'studio': material('LOOKDEV / backdrop', '#20283a', .85),
    }
    ground_col = collection('01 / Plaza module')
    coffee_col = collection('02 / Coffee machine')
    avatar_col = collection('03 / Kroquetita avatar')
    props_col = collection('04 / Street details')
    studio_col = collection('LOOKDEV / cameras and lights (not exported)')

    ground = empty('GroundRoot', ground_col)
    ground['walkable_plane_blender_z'] = 0
    ground['size_metres'] = '4.8 x 3.6; top Y=0 in glTF'
    cube('Foundation', (0, 0, -.18), (4.88, 3.68, .28), mat['charcoal'], .085, ground, ground_col)
    cube('Lower orange seam', (0, 0, -.27), (4.79, 3.59, .035), mat['orange'], .035, ground, ground_col)
    for ix in range(8):
        for iy in range(6):
            x, y = -2.1 + ix * .6, -1.5 + iy * .6
            cube(f'Slate_{ix:02}_{iy:02}', (x, y, -.025), (.584, .584, .05),
                 mat['tile_b' if (ix * 7 + iy * 3) % 5 == 0 else 'tile_a'], .012, ground, ground_col)
    for y in (-1.48, -.88, -.28, .32):
        cube('Guide orange', (-1.78, y, .003), (.065, .23, .006), mat['orange'], .004, ground, ground_col)
    for x in (-1.80, -1.20, -.60, 0, .6, 1.2, 1.8):
        cube('Back curb', (x, 1.68, .08), (.58, .14, .16), mat['stone'], .025, ground, ground_col)
    cube('Front plaque', (-.85, -1.842, -.16), (2.50, .018, .15), mat['rubber'], .015, ground, ground_col)
    label('Plaza name', 'K R O Q U E T I T A   /   C A F E  0 1', (-.85, -1.856, -.16), .067, mat['cream'], ground_col, ground)

    # A self-contained machine with a genuine recessed serving bay.
    coffee = empty('CoffeeRoot', coffee_col)
    coffee['nominal_body_size'] = '1.5 x 2.2 x 1.2 in glTF XYZ'
    def cb(n, loc, size, m, bevel=.025):
        return cube(n, loc, size, mat[m], bevel, coffee, coffee_col)
    cb('Body_base', (0, 0, .20), (1.46, 1.16, .40), 'hood', .065)
    cb('Body_back', (0, .48, 1.29), (1.40, .23, 1.82), 'hood', .045)
    cb('Body_left', (-.66, 0, 1.14), (.18, 1.20, 1.88), 'hood_light', .035)
    cb('Body_right', (.66, 0, 1.14), (.18, 1.20, 1.88), 'hood_light', .035)
    cb('Body_upper', (0, 0, 1.69), (1.46, 1.16, .90), 'hood', .055)
    cb('Top_rim', (0, 0, 2.15), (1.50, 1.20, .10), 'hood_light', .035)
    cb('Orange fascia', (0, -.603, 1.94), (1.37, .035, .36), 'orange', .025)
    label('Cafe sign', 'KROQUE CAFE', (0, -.628, 1.955), .145, mat['charcoal'], coffee_col, coffee)
    label('Machine subtitle', 'CAFE  /  CODIGO  /  REPETIR', (0, -.628, 1.825), .041, mat['charcoal'], coffee_col, coffee)
    cb('Display bezel', (-.18, -.617, 1.53), (.78, .06, .27), 'rubber', .028)
    cb('Display', (-.18, -.653, 1.53), (.69, .012, .192), 'screen', .016)
    label('Display message', 'READY_', (-.18, -.663, 1.55), .085, mat['screen_text'], coffee_col, coffee)
    label('Display price', '+ 8s DE ENERGIA', (-.18, -.664, 1.475), .034, mat['cream'], coffee_col, coffee)
    cylinder('Button rim', (.40, -.64, 1.53), .10, .045, mat['metal'], rotation=(math.pi/2, 0, 0), parent=coffee, collection=coffee_col)
    cylinder('Button', (.40, -.67, 1.53), .075, .03, mat['cyan'], rotation=(math.pi/2, 0, 0), parent=coffee, collection=coffee_col)
    cb('Serving bay', (0, .29, .79), (1.11, .08, .88), 'rubber', .02)
    cb('Basin', (0, -.10, .425), (1.12, .87, .075), 'metal', .035)
    for x in [i * .08 for i in range(-5, 6)]:
        cb('Drip tray slot', (x, -.25, .467), (.025, .42, .006), 'rubber', .003)
    cb('Nozzle mount', (0, -.19, 1.24), (.40, .34, .08), 'charcoal', .02)
    cylinder('Nozzle', (0, -.24, 1.16), .055, .13, mat['metal'], parent=coffee, collection=coffee_col)
    cb('Serving light', (0, -.30, 1.205), (.70, .035, .015), 'lamp', .005)
    cylinder('Cup', (0, -.25, .615), .14, .29, mat['cream'], parent=coffee, collection=coffee_col)
    cylinder('Cup band', (0, -.25, .61), .143, .10, mat['orange'], parent=coffee, collection=coffee_col)
    cylinder('Coffee surface', (0, -.25, .763), .12, .008, mat['coffee'], parent=coffee, collection=coffee_col)
    cb('Cup handle', (.155, -.25, .635), (.08, .09, .14), 'cream', .025)
    label('Cup monogram', 'K', (0, -.397, .614), .06, mat['charcoal'], coffee_col, coffee)
    for x in (-.5, .5):
        for y in (-.40, .40):
            cb('Foot', (x, y, .035), (.20, .23, .07), 'rubber', .018)
    for z in (.55, .68, .81, .94):
        cb('Side vent', (.755, .18, z), (.012, .40, .045), 'rubber', .009)
    cb('Side accent', (.757, -.39, 1.56), (.014, .07, .70), 'cyan', .008)
    for x in (-.68, .68):
        cylinder('Fascia screw', (x, -.63, 1.94), .019, .01, mat['metal'], vertices=12, rotation=(math.pi/2, 0, 0), parent=coffee, collection=coffee_col)
    steam = empty('SteamSocket', coffee_col, coffee)
    steam.location = (0, -.25, .80)
    serve = empty('ServeSocket', coffee_col, coffee)
    serve.location = (0, -.24, 1.10)
    coffee.location = (.63, .60, 0)
    coffee.rotation_euler.z = math.radians(-6)

    avatar = build_avatar(mat, cube, cylinder, avatar_col)
    avatar.location = (-.83, -.60, .003)
    avatar.scale = (1.15,) * 3
    avatar.rotation_euler.z = math.radians(10)
    scene.frame_set(1)

    # Small street furniture shares the same material language.
    planter = empty('PlanterRoot', props_col)
    cube('Planter ceramic', (-1.60, .99, .23), (.55, .55, .46), mat['cream'], .065, planter, props_col)
    cube('Planter lip', (-1.60, .99, .45), (.60, .60, .075), mat['hood_light'], .03, planter, props_col)
    cube('Soil', (-1.60, .99, .49), (.48, .48, .025), mat['soil'], .02, planter, props_col)
    for i, (dx, dy, dz, sx, sy, sz) in enumerate([(-.12,0,.68,.13,.18,.42),(.13,.05,.78,.13,.14,.62),(0,-.15,.69,.13,.16,.45),(-.07,.16,.76,.15,.13,.54)]):
        leaf = cube('Voxel succulent', (-1.60+dx, .99+dy, dz), (sx,sy,sz), mat['leaf_light' if i%2 else 'leaf'], .025, planter, props_col)
        leaf.rotation_euler = (math.radians((i-1)*8), math.radians((i-2)*9), 0)
    for x in (1.96,):
        cube('Bollard base', (x, -.90, .05), (.30,.30,.10), mat['rubber'], .025, None, props_col)
        cube('Bollard', (x, -.90, .33), (.15,.15,.57), mat['hood'], .025, None, props_col)
        cube('Bollard diffuser', (x, -.90, .52), (.162,.162,.12), mat['lamp'], .018, None, props_col)
        cube('Bollard cap', (x, -.90, .605), (.19,.19,.05), mat['charcoal'], .02, None, props_col)

    cube('Studio cyclorama floor', (0, 0, -.37), (200,200,.08), mat['studio'], 0, None, studio_col)
    light('KEY / warm softbox', (-3.5,-4.5,6.5), (0,0,.5), 950, (1,.82,.65), 4.5, studio_col)
    light('FILL / cool softbox', (4,-1,4), (0,0,1), 600, (.68,.82,1), 3.5, studio_col)
    light('RIM / cyan edge', (1.5,3,5), (.4,.5,1), 1100, (.35,.85,1), 3, studio_col)
    light('FRONT / face readability', (-.5,-4,2.4), (-.8,-.6,.8), 90, (1,.94,.84), 2, studio_col)
    hero = camera('01 / Full plaza', (6,-9,6.2), (0,0,.65), 60, studio_col, ortho=6.9)
    detail = camera('02 / Character and coffee', (3.5,-6,3.25), (-.15,.05,1.05), 62, studio_col, ortho=3.85)
    scene.camera = hero
    scene['Kroquetita pilot'] = VERSION + ' / voxel vinyl / soft warm key / cyan rim'
    scene['Export contract'] = 'GLB +Y up, +Z forward; one unit = one metre. Lights excluded.'
    scene['Website status'] = 'Look-development prototype, not yet integrated into the live website.'
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.region_3d.view_perspective = 'CAMERA'
                    space.overlay.show_overlays = False
                    space.shading.type = 'MATERIAL'
                    space.shading.use_scene_lights = True
                    space.shading.use_scene_world = True
    return scene, {'avatar':avatar, 'coffee_machine':coffee, 'plaza_module':ground}, hero, detail


def descendants(root):
    out = [root]
    for child in root.children:
        out.extend(descendants(child))
    return out


def export_assets(scene, roots):
    folder = HERE / 'exports' / VERSION
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {'version':1, 'units':'metres', 'up':'+Y', 'forward':'+Z', 'assets':{}}
    for name, root in roots.items():
        scene.frame_set(1)
        original = root.matrix_basis.copy()
        root.location = (0,0,0)
        root.rotation_euler = (0,0,0)
        root.scale = (1,1,1)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        objects = descendants(root)
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        target = folder / (name + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
            use_selection=True, export_apply=True, export_yup=True,
            export_lights=False, export_cameras=False, export_extras=True,
            export_animations=name=='avatar', export_animation_mode='NLA_TRACKS',
            export_frame_range=True, export_force_sampling=True,
            export_materials='EXPORT')
        root.matrix_basis = original
        manifest['assets'][name] = {'file':target.name,'bytes':target.stat().st_size,
            'mesh_objects':sum(o.type=='MESH' for o in objects),
            'root':root.name,'animation':'Idle' if name=='avatar' else None}
    (folder/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    bpy.ops.object.select_all(action='DESELECT')
    scene.frame_set(1)


def main():
    HERE.mkdir(parents=True, exist_ok=True)
    print('KQ_STAGE: building geometry', flush=True)
    scene, roots, hero, detail = build()
    print('KQ_STAGE: exporting assets', flush=True)
    export_assets(scene, roots)
    finalize_exports(HERE / 'exports' / VERSION)
    scene.camera = hero
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f'kroquetita-plaza-{VERSION}.blend'))
    print('KQ_STAGE: rendering full plaza', flush=True)
    scene.render.filepath = str(HERE/f'preview-plaza-{VERSION}.png')
    bpy.ops.render.render(write_still=True)
    print('KQ_STAGE: rendering detail', flush=True)
    scene.camera = detail
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1280
    scene.render.filepath = str(HERE/f'preview-detail-{VERSION}.png')
    bpy.ops.render.render(write_still=True)
    scene.camera = hero
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1120
    scene.render.filepath = str(HERE/f'preview-plaza-{VERSION}.png')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f'kroquetita-plaza-{VERSION}.blend'))
    print('KQ_DONE', flush=True)


if __name__ == '__main__':
    main()
