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
    """Two separated lobes, their sparse cortex graph, and a shared brain stem."""
    centre = (0.0, 2.15, 8.02)
    _hook(k, hooks, "Hook_Career_BrainPortal", (0.0, 1.45, 6.10), kind="portal")
    _hook(k, hooks, "Hook_Career_CoreFocus", centre, kind="camera_target")
    k.link("Career_BrainStem", (0.0, 2.15, 6.19), (0.0, 2.15, 7.12), 0.105, "gold")
    k.ball("Career_CorePulse", (0.0, 2.15, 7.18), 0.17, "warm", subdivisions=1)

    for side, sign in (("Left", -1), ("Right", 1)):
        lobe = k.ball("Career_Hemisphere_" + side,
                      (sign * 0.57, centre[1], centre[2]), 1.0,
                      "purple" if sign < 0 else "lavender", subdivisions=2)
        lobe.scale = (0.44, 0.80, 0.88)
        nodes = []
        for band, zoff in enumerate((-0.49, 0.49)):
            for j in range(4):
                angle = math.tau * j / 4 + (0.10 if band else 0.0)
                # Slight fore/aft asymmetry hints at lobes, not two perfect balls.
                x = sign * 0.57 + math.cos(angle) * 0.49
                y = math.sin(angle) * (0.93 if j < 2 else 1.02)
                z = zoff + 0.045 * math.cos(angle * 2)
                nodes.append((centre[0] + x, centre[1] + y, centre[2] + z))
        nodes.extend(((sign * 0.57, centre[1] + 0.04, centre[2] - 1.00),
                      (sign * 0.57, centre[1] - 0.04, centre[2] + 1.00)))
        for j, at in enumerate(nodes):
            node_material = ("warm" if j == 9 else "light" if j in (1, 5)
                             else "cyan" if sign < 0 else "pink")
            k.ball("Career_Cortex_%s_%02d" % (side, j), at,
                   0.105 if j in (1, 3, 5, 7, 9) else 0.074,
                   node_material, subdivisions=1)
        edges = []
        for band in (0, 1):
            edges.extend((band * 4 + j, band * 4 + (j + 1) % 4) for j in range(4))
        edges.extend(((0, 4), (2, 6), (8, 0), (8, 2), (9, 5), (9, 7)))
        for j, (a, b) in enumerate(edges):
            k.link("Career_Synapse_%s_%02d" % (side, j), nodes[a], nodes[b],
                   0.021, "light" if j % 7 == 0 else "blue" if sign < 0 else "purple")
    k.link("Career_CorpusCallosum", (-0.28, 2.15, 8.10), (0.28, 2.15, 8.10),
           0.047, "gold")


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

    # A raised lookout has a clear front opening and a warm illuminated underside.
    k.box("Career_CoreDeck", (0.0, 1.74, 6.03), (3.7, 2.4, 0.22), "cream", bevel=0.065)
    k.box("Career_CoreUnderlight", (0.0, 1.74, 5.89), (3.25, 2.05, 0.08), "gold", bevel=0.025)
    for side in (-1, 1):
        k.link("Career_CoreStrut_%s" % side,
               (side * 0.92, 1.82, 4.20), (side * 1.30, 1.82, 5.90), 0.065, "metal")
        k.link("Career_CoreSideRail_%s" % side,
               (side * 1.73, 0.80, 6.65), (side * 1.73, 2.67, 6.65), 0.031, "cyan")
    k.link("Career_CoreBackRail", (-1.73, 2.67, 6.65), (1.73, 2.67, 6.65), 0.031, "cyan")
    _label(k, "Career_CoreName", "THE CORE", (0.0, 0.515, 5.98), 0.25, "charcoal")
    _hook(k, hooks, "Hook_Career_Lookout", (0.0, 0.95, 6.15), kind="destination")
    _hook(k, hooks, "Hook_Career_Entrance", (0.0, -3.60, 0.05), kind="entrance")
    _hook(k, hooks, "Hook_Career_Camera", (0.0, -13.5, 8.8), kind="camera_position")
    _exterior_brain(k, hooks)

    return {
        "district": "career", "hooks": hooks,
        "geometry_objects_excluding_platform": k.geometry_count,
        "footprint_m": [18.0, 8.0], "maximum_height_m": 9.13,
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
