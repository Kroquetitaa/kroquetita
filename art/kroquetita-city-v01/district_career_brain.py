"""Two toy-voxel districts: the career skyline and the inside of its brain.

The scene builder supplies a Kit with ``root`` and ``col`` attributes and these
methods: box, cyl, ball, link, text, empty, and platform. Coordinates are local
to the parent, Blender Z is up, and the fronts of signs face -Y. A missing parent
means Kit.root. Material arguments are keys in the caller's shared palette.

``build_career(kit, data)`` consumes data['stages'] (title, start, optional end,
discipline, color). ``build_brain(kit, data)`` consumes data['skills']. Both return
metadata including exact hook object names and a conservative geometry-object
count, treating each text as a future mesh. The platform helper's internals are
not included in that count. Neither constructor exports, saves, changes scene
frames, accesses external files, or runs until explicitly called.
"""

import math
import re

CORE_LIFT = 2.70  # Keep the complete lookout above the native company roof logos.


class _CountedKit:
    """Count generated geometry without assuming a particular Kit implementation."""

    _GEOMETRY = {"box", "cyl", "ball", "link", "text"}

    def __init__(self, kit):
        self.kit = kit
        self.geometry_count = 0

    def __getattr__(self, name):
        value = getattr(self.kit, name)
        if name not in self._GEOMETRY:
            return value

        def counted(*args, **kwargs):
            self.geometry_count += 1
            return value(*args, **kwargs)

        return counted


def _slug(value):
    return re.sub(r"[^a-zA-Z0-9]+", "_", str(value)).strip("_") or "Unnamed"


def _label(k, name, words, at, size, material="cream", parent=None):
    obj = k.text(name, str(words), at, size, material, parent=parent)
    # Explicit alignment also makes this module work with a left-aligned Kit.
    if getattr(obj, "data", None) is not None:
        if hasattr(obj.data, "align_x"):
            obj.data.align_x = "CENTER"
        if hasattr(obj.data, "align_y"):
            obj.data.align_y = "CENTER"
    return obj


def _hook(k, hooks, name, location, parent=None, kind="destination"):
    obj = k.empty(name, location, parent=parent)
    obj["hook_kind"] = kind
    hooks.append(obj.name)
    return obj


def _deck_between(k, name, a, b, width, material="slate", thickness=0.13):
    """A flat rectangular bridge, optionally sloped, along its local X axis."""
    dx, dy, dz = (b[index] - a[index] for index in range(3))
    horizontal = math.hypot(dx, dy)
    length = math.sqrt(horizontal * horizontal + dz * dz)
    middle = tuple((a[index] + b[index]) / 2.0 for index in range(3))
    obj = k.box(name, middle, (length, width, thickness), material, bevel=0.025)
    obj.rotation_euler[1] = -math.atan2(dz, horizontal)
    obj.rotation_euler[2] = math.atan2(dy, dx)
    return obj


def _timeline_action(obj, first, last):
    """Animate only building growth; the district root remains stationary."""
    obj.scale = (1.0, 1.0, 0.0001)
    obj.keyframe_insert(data_path="scale", frame=1, group="Career growth")
    if first > 1:
        obj.keyframe_insert(data_path="scale", frame=first, group="Career growth")
    obj.scale = (1.0, 1.0, 1.0)
    obj.keyframe_insert(data_path="scale", frame=last, group="Career growth")
    obj.keyframe_insert(data_path="scale", frame=150, group="Career growth")
    animation = obj.animation_data
    action = animation.action
    if action is None:
        return
    action.name = "CareerGrowth_" + obj.name
    slot = getattr(animation, "action_slot", None)
    track = animation.nla_tracks.new()
    track.name = "CareerTimeline"
    try:
        strip = track.strips.new("CareerTimeline", 1, action)
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
        strip.action_frame_start = 1.0
        strip.action_frame_end = 150.0
        strip.extrapolation = "HOLD_FORWARD"
        animation.action = None
    except (AttributeError, RuntimeError, TypeError):
        animation.nla_tracks.remove(track)
        animation.action = action


def _roof_prop(k, node, index, discipline, height, accent):
    """Compact recognizable rooftop machines; no external logos or textures."""
    prefix = "Career_Roof_%02d_" % index
    z = height + 0.16
    y = 0.17
    if discipline in ("frontend", "mobile"):
        portrait = discipline == "mobile"
        wide, tall = ((0.28, 0.48) if portrait else (0.64, 0.36))
        k.box(prefix + "Device", (-0.28, y, z + tall / 2),
              (wide, 0.10, tall), "charcoal", bevel=0.028, parent=node)
        k.box(prefix + "Screen", (-0.28, y - 0.058, z + tall / 2),
              (wide * 0.79, 0.015, tall * 0.77), accent, bevel=0.012, parent=node)
        k.box(prefix + "Foot", (-0.28, y, z - 0.015),
              (0.40, 0.24, 0.06), "metal", bevel=0.015, parent=node)
    elif discipline == "data":
        for j, tall in enumerate((0.20, 0.36, 0.51)):
            k.cyl(prefix + "Database_%d" % j, (-0.55 + j * 0.28, y, z + tall / 2),
                  0.105, tall, ("cyan", "blue", "green")[j], vertices=12, parent=node)
    elif discipline in ("ai", "blockchain"):
        spots = ((-0.53, y, z + 0.16), (-0.20, y, z + 0.48), (0.13, y, z + 0.16))
        for j, at in enumerate(spots):
            if discipline == "ai":
                k.ball(prefix + "Node_%d" % j, at, 0.12, accent, subdivisions=1, parent=node)
            else:
                k.box(prefix + "Block_%d" % j, at, (0.20, 0.20, 0.20),
                      accent, bevel=0.022, parent=node)
        k.link(prefix + "Link_A", spots[0], spots[1], 0.018, "cream", parent=node)
        k.link(prefix + "Link_B", spots[1], spots[2], 0.018, "cream", parent=node)
    elif discipline == "lead":
        k.cyl(prefix + "Table", (-0.24, y, z + 0.13), 0.29, 0.08,
              "wood", vertices=12, parent=node)
        k.link(prefix + "FlagPole", (0.25, y, z), (0.25, y, z + 0.52),
               0.023, "metal", parent=node)
        k.box(prefix + "Flag", (0.38, y, z + 0.43), (0.28, 0.035, 0.17),
              "gold", bevel=0.010, parent=node)
    else:
        for j in range(2):
            k.box(prefix + "Server_%d" % j, (-0.44 + j * 0.33, y, z + 0.22),
                  (0.25, 0.28, 0.44), "charcoal", bevel=0.023, parent=node)
        k.box(prefix + "Status", (-0.28, y - 0.15, z + 0.29),
              (0.53, 0.012, 0.055), accent, bevel=0.004, parent=node)


def _exterior_brain(k, hooks):
    """A friendly satin brain: real rounded gyri, two lobes and sparse neurons."""
    import bpy
    from kit import material
    before = set(k.col.objects)

    for key, color, rough, metal, emission in [
        ('brain_coral', '#df7c9b', .4, 0, 0),
        ('brain_coral_fold', '#e98da8', .40, 0, 0),
        ('brain_lavender', '#a388c7', .4, 0, 0),
        ('brain_lavender_fold', '#b49bd5', .40, 0, 0),
        ('brain_ink', '#342a49', .33, 0, 0),
        ('brain_spark', '#9af3e5', .3, .08, .7),
    ]:
        name='CITY / '+key
        # Rebuild only this private palette, so rerunning the local polish also
        # updates the finish in existing .blend files without changing city mats.
        previous=bpy.data.materials.get(name)
        if previous:previous.name=name+' / previous'
        k.mats[key]=material(name,color,rough,metal,emission)

    def smooth_ball(name, at, size, mat, subdivisions=3):
        obj=k.ball(name,at,1,mat,subdivisions=subdivisions)
        obj.scale=size
        for polygon in obj.data.polygons: polygon.use_smooth=True
        return obj

    def fold(name, points, radius, mat):
        curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
        curve.resolution_u=4;curve.bevel_depth=radius;curve.bevel_resolution=2
        curve.use_fill_caps=True
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
        for index,(point,at) in enumerate(zip(spline.bezier_points,points)):
            point.co=at;point.handle_left_type='AUTO';point.handle_right_type='AUTO'
            if name.startswith('Career_Gyrus'):
                point.radius=.05 if index in [0,len(points)-1] else .8 if index in [1,len(points)-2] else 1
        obj=bpy.data.objects.new(name,curve);k.col.objects.link(obj)
        obj.parent=k.root;curve.materials.append(k.m(mat))
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
        obj=bpy.context.object
        for polygon in obj.data.polygons:polygon.use_smooth=True
        if isinstance(k,_CountedKit):k.geometry_count+=1
        return obj

    def hemisphere(side,sign,mat):
        """One half of a shared ellipsoid, with a narrow real central fissure."""
        import bmesh
        vertices=[];faces=[];rows=24;columns=20
        for i in range(rows+1):
            theta=math.pi*i/rows
            for j in range(columns+1):
                phi=math.pi*j/columns
                x=sign*(.055+1.22*math.sin(theta)*math.sin(phi))
                y=2.15+.93*math.sin(theta)*math.cos(phi)
                z=8.02+.80*math.cos(theta)
                vertices.append((x,y,z))
        for i in range(rows):
            for j in range(columns):
                a=i*(columns+1)+j
                faces.append((a,a+1,a+columns+2,a+columns+1))
        # Flat medial face closes each half. The original ellipse is otherwise
        # shared, so the two halves read as one brain rather than two balloons.
        boundary=[i*(columns+1) for i in range(rows+1)]
        boundary += [i*(columns+1)+columns for i in reversed(range(rows+1))]
        faces.append(tuple(boundary))
        name='Career_Hemisphere_'+side
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(k.m(mat))
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
        obj=bpy.data.objects.new(name,mesh);k.col.objects.link(obj);obj.parent=k.root
        for polygon in mesh.polygons:polygon.use_smooth=len(polygon.vertices)<10
        if isinstance(k,_CountedKit):k.geometry_count+=1
        return obj

    centre = (0.0, 2.15, 8.02)
    _hook(k, hooks, "Hook_Career_BrainPortal", (0.0, 1.45, 6.10), kind="portal")
    _hook(k, hooks, "Hook_Career_CoreFocus", centre, kind="camera_target")
    k.link("Career_BrainStem", (0.0, 2.15, 6.19), (0.0, 2.15, 7.25), 0.12, "gold")
    smooth_ball("Career_CorePulse", (0.0, 2.15, 7.17), (.24,.24,.18), "brain_spark",2)
    k.cyl('Career_BrainDock',(0,2.15,6.20),.46,.10,'purple',vertices=32)
    k.cyl('Career_BrainDockLight',(0,2.15,6.26),.37,.025,'brain_spark',vertices=32)
    for side, sign in (("Left", -1), ("Right", 1)):
        color='brain_coral' if sign<0 else 'brain_lavender'
        hemisphere(side,sign,color)
        # Winding gyri follow the ellipsoid surface. The darker exposed valleys
        # between these real meshes remain readable without a normal-map texture.
        for row,base_phi in enumerate([.14,.54,.95,1.37,1.80,2.24,2.68]):
            points=[]
            for step in range(19):
                t=-1.38+step*2.73/18
                phi=base_phi+.18*math.sin(t*6.4+row*1.7+sign*.7)
                phi=max(.04,min(math.pi-.04,phi))
                x=sign*(.055+1.22*math.cos(t)*math.sin(phi))
                y=2.15+.93*math.sin(t)
                z=8.02+.80*math.cos(t)*math.cos(phi)
                points.append((x,y,z))
            fold('Career_Gyrus_%s_%02d'%(side,row),points,.085,color+'_fold')
        for j,(x,y,z) in enumerate([(sign*1.08,1.73,8.37),(sign*.51,2.50,8.72)]):
            smooth_ball('Career_Cortex_%s_%02d'%(side,j),(x,y,z),(.075,.075,.075),'brain_spark',2)
        # Small curious eyes sit on the front, leaving the cortex the main feature.
        smooth_ball('Career_BrainEye_'+side,(sign*.41,1.222,7.84),(.060,.035,.086),'brain_ink',2)
        smooth_ball('Career_BrainGlint_'+side,(sign*.41-.014,1.190,7.868),(.018,.009,.023),'cream',2)
        fold('Career_BrainBrow_'+side,[(sign*.32,1.239,8.015),(sign*.41,1.219,8.04+(0.03 if sign>0 else 0)),(sign*.50,1.247,8.02)],.019,'brain_ink')
    fold('Career_BrainSmile',[(-.14,1.237,7.65),(-.08,1.210,7.61),(0,1.20,7.60),(.08,1.210,7.61),(.14,1.237,7.65)],.018,'brain_ink')
    # Three input contacts are the visual destination for the website's live data.
    for i,x in enumerate([-.19,0,.19]):
        smooth_ball('Career_BrainInput_%02d'%i,(x,2.00,6.47),(.055,.055,.055),'brain_spark',2)
    # One shared translation keeps every fold, facial detail and hook aligned.
    for obj in set(k.col.objects)-before:
        if obj.parent == k.root:obj.location.z += CORE_LIFT


def _core_sign(k):
    """Freestanding plaque above the deck, clear of the tower and brand logo."""
    for sign in [-1,1]:
        k.link('Career_CoreSignPost_'+str(sign),(sign*1.23,.54,6.14+CORE_LIFT),(sign*1.23,.54,6.48+CORE_LIFT),.025,'metal')
    k.box('Career_CoreSignRim',(0,.53,6.65+CORE_LIFT),(2.95,.12,.56),'gold',bevel=.065)
    k.box('Career_CoreSignPanel',(0,.46,6.65+CORE_LIFT),(2.84,.055,.46),'purple',bevel=.045)
    _label(k,'Career_CoreName','THE CORE',(0,.420,6.65+CORE_LIFT),.34,'cream')


def _core_lookout(k, hooks):
    """Raise the whole composition; lengthen struts from their original anchors."""
    k.box('Career_CoreDeck',(0,1.74,6.03+CORE_LIFT),(3.7,2.4,.22),'cream',bevel=.065)
    k.box('Career_CoreUnderlight',(0,1.74,5.89+CORE_LIFT),(3.25,2.05,.08),'gold',bevel=.025)
    for side in [-1,1]:
        k.link('Career_CoreStrut_'+str(side),(side*.92,1.82,4.20),(side*1.30,1.82,5.90+CORE_LIFT),.065,'metal')
        k.link('Career_CoreSideRail_'+str(side),(side*1.73,.80,6.65+CORE_LIFT),(side*1.73,2.67,6.65+CORE_LIFT),.031,'cyan')
    k.link('Career_CoreBackRail',(-1.73,2.67,6.65+CORE_LIFT),(1.73,2.67,6.65+CORE_LIFT),.031,'cyan')
    _core_sign(k)
    _hook(k,hooks,'Hook_Career_Lookout',(0,.95,6.15+CORE_LIFT),kind='destination')
    _exterior_brain(k,hooks)


def build_career(k, data):
    """Build an 18 x 8 m skyline, animated stages, and the elevated brain core.

    Buildings grow by local Z scale during frames 1-150. Frame 150 is the complete
    presentation view. Dates on the pavement cover 2021-2026; actual stage start
    and end years remain visible on each building. At most eleven supplied stages
    are represented so the promised footprint and geometry budget stay stable.
    """
    k = _CountedKit(k)
    hooks = []
    stages = list(data.get("stages") or [])[:11]
    if not stages:
        stages = [{"title": "Kroquetita", "start": "2021", "end": None, "discipline": "ai"}]
    k.platform((18.0, 8.0), accent="orange")
    k.root["district"] = "career"
    k.root["preview_frame"] = 150

    front_count = math.ceil(len(stages) / 2)
    back_count = len(stages) - front_count
    accents = {"fullstack": "blue", "frontend": "cyan", "mobile": "pink",
               "lead": "gold", "blockchain": "purple", "data": "green", "ai": "orange"}
    heights = []
    for i, stage in enumerate(stages):
        front = i < front_count
        count = front_count if front else back_count
        local_index = i if front else i - front_count
        x = (local_index - (count - 1) / 2) * 2.68
        if not front:
            x = -x
        y = -1.62 if front else 1.82
        height = 1.3 + (i / max(1, len(stages) - 1)) * 3.7
        heights.append(height)
        width, depth = 2.17, 1.90
        title = str(stage.get("title") or "Stage %d" % (i + 1))
        discipline = str(stage.get("discipline") or "fullstack")
        accent = accents.get(discipline, "orange")
        node = k.empty("Career_Stage_%02d_%s" % (i + 1, _slug(title)), (x, y, 0.0))
        node["stage_index"] = i
        node["title"] = title
        node["start"] = str(stage.get("start") or "")
        node["end"] = str(stage.get("end") or "present")
        node["discipline"] = discipline
        node["brand_color_reference"] = str(stage.get("color") or "")
        prefix = "Career_%02d_" % (i + 1)
        facade = "slate" if i < 4 else "lavender" if i < 8 else "purple"
        k.box(prefix + "Tower", (0.0, 0.0, height / 2), (width, depth, height),
              facade, bevel=0.075, parent=node)
        k.box(prefix + "Plinth", (0.0, 0.0, 0.07), (width + 0.10, depth + 0.10, 0.14),
              "charcoal", bevel=0.035, parent=node)
        k.box(prefix + "Roof", (0.0, 0.0, height + 0.045),
              (width + 0.08, depth + 0.08, 0.12), "cream", bevel=0.030, parent=node)
        k.box(prefix + "Entry", (-0.54, -depth / 2 - 0.012, 0.29),
              (0.38, 0.033, 0.49), "charcoal", bevel=0.026, parent=node)
        k.box(prefix + "WindowBand", (0.04, -depth / 2 - 0.017, height * 0.37),
              (1.68, 0.031, max(0.09, height * 0.085)), "glass", bevel=0.014, parent=node)
        k.box(prefix + "BrandPanel", (0.0, -depth / 2 - 0.024, height * 0.70),
              (1.97, 0.048, 0.45), "charcoal", bevel=0.025, parent=node)
        k.box(prefix + "LightSpine", (width / 2 - 0.065, -depth / 2 - 0.022, height / 2),
              (0.045, 0.041, height * 0.82), accent, bevel=0.009, parent=node)
        label_size = min(0.19, 2.75 / max(8, len(title)))
        _label(k, prefix + "Brand", title, (0.0, -depth / 2 - 0.053, height * 0.70),
               label_size, "cream", node)
        start = str(stage.get("start") or "2021")[:4]
        end = str(stage.get("end") or "NOW")[:4]
        _label(k, prefix + "Dates", "%s / %s" % (start, end),
               (0.42, -depth / 2 - 0.04, 0.22), 0.105, "cream", node)
        _roof_prop(k, node, i, discipline, height, accent)
        k.cyl(prefix + "JumpPad", (0.61, -0.44, height + 0.125), 0.25, 0.065,
              accent, vertices=16, parent=node)
        _hook(k, hooks, "Hook_Career_Stage_%02d" % (i + 1),
              (0.61, -0.44, height + 0.19), node, "stage_target")
        begin = round(1 + i * 109 / max(1, len(stages) - 1))
        _timeline_action(node, begin, min(150, begin + 40))

    # A physical time rail makes the chronology visible from the front approach.
    k.box("Career_TimeRail", (0.0, -3.17, 0.035), (15.6, 0.075, 0.055), "gold", bevel=0.012)
    for j, year in enumerate(range(2021, 2027)):
        x = -7.5 + j * 3.0
        if year in (2021, 2026):
            k.cyl("Career_YearMarker_%s" % year, (x, -3.17, 0.075), 0.12, 0.10,
                  "orange" if year == 2026 else "metal", vertices=12)
        _label(k, "Career_Year_%s" % year, str(year), (x, -3.27, 0.30), 0.19, "cream")

    _core_lookout(k, hooks)
    _hook(k, hooks, "Hook_Career_Entrance", (0.0, -3.60, 0.05), kind="entrance")
    _hook(k, hooks, "Hook_Career_Camera", (0.0, -13.5, 8.8), kind="camera_position")

    return {
        "district": "career", "hooks": hooks,
        "geometry_objects_excluding_platform": k.geometry_count,
        "footprint_m": [18.0, 8.0], "maximum_height_m": 9.13 + CORE_LIFT,
        "stages": len(stages), "preview_frame": 150,
        "animation": "CareerTimeline: staggered local-Z building growth, frames 1-150; no district root motion.",
        "integration_note": "Stage destination hooks follow the growth transforms; use frame 150 for the complete static export.",
    }


def build_brain(k, data):
    """Build a 10 x 10 m open observatory inside the neural core.

    The front quarter stays open for a camera and entrance. Six themed neurons
    carry canonical integration hooks plus hooks for every supplied skill. Their
    radial decks meet the centre; the perimeter is a segmented toy-metal ring.
    """
    k = _CountedKit(k)
    hooks = []
    k.platform((10.0, 10.0), accent="cyan")
    k.root["district"] = "brain_interior"

    # Open C-shaped perimeter, with no fence across the main viewing direction.
    ring_points = []
    for j in range(9):
        angle = math.radians(-40 + j * 32.5)
        ring_points.append((3.90 * math.cos(angle), 3.90 * math.sin(angle), 0.22))
    for j in range(8):
        _deck_between(k, "Brain_RingDeck_%02d" % j,
                      ring_points[j], ring_points[j + 1], 0.70, "slate", 0.16)
        a = ring_points[j]
        b = ring_points[j + 1]
        # Short outward parapets preserve the open interior silhouette.
        rail_a = (a[0] * 1.065, a[1] * 1.065, 0.79)
        rail_b = (b[0] * 1.065, b[1] * 1.065, 0.79)
        if j % 2 == 0:
            k.cyl("Brain_RailPost_%02d" % j,
                  (rail_a[0], rail_a[1], 0.48), 0.035, 0.61, "metal", vertices=10)
        k.link("Brain_Rail_%02d" % j, rail_a, rail_b, 0.022, "cyan")

    k.cyl("Brain_CentreDeck", (0.0, 0.0, 0.18), 1.24, 0.30, "cream", vertices=12)
    k.cyl("Brain_CentreSocket", (0.0, 0.0, 0.37), 0.46, 0.14, "charcoal", vertices=12)
    k.ball("Brain_CentreMemory", (0.0, 0.0, 0.94), 0.37, "glass", subdivisions=2)
    _deck_between(k, "Brain_EntranceBridge", (0.0, -3.80, 0.22), (0.0, -0.90, 0.22),
                  1.08, "slate", 0.15)

    # The portal is a freestanding toy arch. Its opening remains physically clear.
    for side in (-1, 1):
        k.box("Brain_PortalPillar_%s" % side, (side * 0.78, -3.62, 1.24),
              (0.25, 0.32, 2.48), "purple", bevel=0.055)
        k.box("Brain_PortalLight_%s" % side, (side * 0.63, -3.80, 1.24),
              (0.050, 0.025, 2.25), "cyan", bevel=0.012)
    k.box("Brain_PortalLintel", (0.0, -3.62, 2.49), (1.82, 0.36, 0.23),
          "lavender", bevel=0.055)
    _label(k, "Brain_PortalTitle", "INSIDE THE CORE", (0.0, -3.815, 2.49), 0.145, "cream")
    _hook(k, hooks, "Hook_Brain_Entrance", (0.0, -3.93, 0.31), kind="portal")
    _hook(k, hooks, "Hook_Brain_ReturnToCareer", (0.0, -3.45, 0.31), kind="portal")

    clusters = (
        ("RAG", -35, 1.78, "cyan"),
        ("Agents", 15, 2.18, "orange"),
        ("LLM", 65, 2.43, "pink"),
        ("Data", 115, 2.10, "green"),
        ("Frontend", 165, 1.88, "blue"),
        ("Systems", 215, 1.65, "gold"),
    )
    anchors = {}
    for index, (name, degrees, height, accent) in enumerate(clusters):
        angle = math.radians(degrees)
        x, y = 2.78 * math.cos(angle), 2.78 * math.sin(angle)
        anchors[name] = (x, y, height)
        prefix = "Brain_%s_" % name
        k.cyl(prefix + "Plinth", (x, y, 0.32), 0.40, 0.18, "charcoal", vertices=12)
        k.ball(prefix + "Neuron", (x, y, height), 0.29, accent, subdivisions=1)
        k.link(prefix + "Stem", (x, y, 0.42), (x, y, height - 0.24), 0.034, "metal")
        tangent = (-math.sin(angle), math.cos(angle))
        for side in ((-1,) if index % 2 else (1,)):
            satellite = (x + tangent[0] * 0.48 * side,
                         y + tangent[1] * 0.48 * side,
                         height + (0.30 if side == 1 else -0.30))
            k.ball(prefix + "Dendrite_%s" % side, satellite, 0.095, accent, subdivisions=1)
            k.link(prefix + "Branch_%s" % side, (x, y, height), satellite, 0.023, "cream")
        k.link(prefix + "MemoryConnection", (x, y, height - 0.12),
               (0.0, 0.0, 0.94), 0.016, "lavender")
        _deck_between(k, prefix + "Bridge",
                      (0.99 * math.cos(angle), 0.99 * math.sin(angle), 0.22),
                      (3.72 * math.cos(angle), 3.72 * math.sin(angle), 0.22), 0.47, "slate", 0.13)
        _label(k, prefix + "Label", name.upper(), (x, y - 0.31, 0.69), 0.17, "cream")
        _hook(k, hooks, "Hook_Skill_%s" % name, (x, y, height), kind="skill_focus")

    # Assign every supplied skill to a physical constellation without multiplying
    # decorative meshes; these semantic empties are the application's link targets.
    canonical_slugs = {_slug(name).lower() for name in anchors}
    skill_list = list(data.get("skills") or [])
    assigned = set()
    for index, raw_skill in enumerate(skill_list):
        skill = str(raw_skill)
        slug = _slug(skill)
        low = skill.lower()
        if slug.lower() in canonical_slugs or slug.lower() in assigned:
            continue
        assigned.add(slug.lower())
        if any(word in low for word in ("react", "front", "next", "three", "mobile", "web")):
            group = "Frontend"
        elif any(word in low for word in ("data", "python", "stat", "sql")):
            group = "Data"
        elif any(word in low for word in ("agent", "mcp", "tool")):
            group = "Agents"
        elif any(word in low for word in ("rag", "retriev", "vector", "search")):
            group = "RAG"
        elif any(word in low for word in ("ia", "ai", "llm", "nlp", "model", "learn")):
            group = "LLM"
        else:
            group = "Systems"
        anchor = anchors[group]
        obj = _hook(k, hooks, "Hook_Skill_" + slug,
                    (anchor[0], anchor[1], anchor[2] + 0.035 * (index % 3)), kind="skill_detail")
        obj["skill"] = skill
        obj["constellation"] = group

    # A chunky telescope makes this read as a place to explore, rather than a
    # graph floating in an empty room. It stands off the central access route.
    telescope = (-1.50, -2.25, 0.32)
    for j in range(3):
        a = math.tau * j / 3
        foot = (telescope[0] + 0.33 * math.cos(a),
                telescope[1] + 0.33 * math.sin(a), 0.29)
        k.link("Brain_TelescopeLeg_%d" % j, foot, (-1.50, -2.25, 1.05), 0.033, "metal")
    k.link("Brain_TelescopeBody", (-1.65, -2.56, 1.15), (-1.27, -1.91, 1.50), 0.115, "purple")
    k.link("Brain_TelescopeLens", (-1.27, -1.91, 1.50), (-1.23, -1.84, 1.54), 0.129, "cyan")
    k.link("Brain_TelescopeEyepiece", (-1.72, -2.68, 1.09), (-1.65, -2.56, 1.15), 0.055, "rubber")
    _hook(k, hooks, "Hook_Brain_Telescope", (-1.76, -2.82, 0.31), kind="interaction")
    _hook(k, hooks, "Hook_Brain_Centre", (0.0, -0.65, 0.34), kind="destination")
    _hook(k, hooks, "Hook_Brain_Camera", (0.0, -10.5, 7.0), kind="camera_position")

    return {
        "district": "brain_interior", "hooks": hooks,
        "geometry_objects_excluding_platform": k.geometry_count,
        "footprint_m": [10.0, 10.0], "maximum_height_m": 2.89,
        "constellations": [cluster[0] for cluster in clusters],
        "animation": "Static observatory; all skill and portal hooks are named transform targets for application interaction.",
        "integration_note": "Hook_Skill_* transforms identify the six visible constellations and all supplied skills; the front stays open for the camera.",
    }
