"""Kroquetita vinyl / voxel avatar for the first Blender look-development pilot.

Import and call ``build_avatar(mat, cube, cylinder, collection)`` from the scene
builder.  This module does not execute on import, change the scene frame range,
save files, or export anything.  Units are metres; +Z is up and the face looks
towards -Y.  The unanimated model is approximately 0.57 x 0.43 x 1.05 m.

The supplied mesh helpers can use either world or local coordinates: all meshes
are created unparented, then parented and positioned explicitly by this module.
The idle is baked into transform keys and matching ``Idle`` NLA tracks, which
allows an exporter using NLA-track grouping to combine the pieces into one clip.
"""

import math

import bpy


def build_avatar(mat, cube, cylinder, collection):
    """Build and return an ``AvatarRoot`` Empty without moving that root.

    Required material keys: hood, hood_light, charcoal, cream, orange, rubber,
    metal, cyan, pink.  ``cube`` and ``cylinder`` follow the caller's supplied
    helper contract.  Every generated object belongs to ``collection``.
    """
    required = (
        "hood", "hood_light", "charcoal", "cream", "orange", "rubber",
        "metal", "cyan", "pink",
    )
    missing = [key for key in required if key not in mat]
    if missing:
        raise ValueError("Avatar materials missing: " + ", ".join(missing))

    def empty(name, parent=None, at=(0.0, 0.0, 0.0)):
        obj = bpy.data.objects.new(name, None)
        collection.objects.link(obj)
        obj.empty_display_type = "PLAIN_AXES"
        obj.empty_display_size = 0.055
        obj.parent = parent
        obj.location = at
        obj.rotation_mode = "XYZ"
        return obj

    root = empty("AvatarRoot")
    root["character"] = "Kroquetita"
    root["lookdev"] = "vinyl-voxel-v01"
    root["forward_axis"] = "-Y"
    root["nominal_height_m"] = 1.05
    root["idle_clip"] = "Idle, frames 1-96"

    # Hips and shoulders are actual transform pivots, rather than mesh centres.
    body = empty("Body", root, (0.0, 0.0, 0.34))
    head = empty("Head", body, (0.0, -0.005, 0.39))
    arm_l = empty("Arm_L", body, (-0.215, 0.0, 0.31))
    arm_r = empty("Arm_R", body, (0.215, 0.0, 0.31))
    leg_l = empty("Leg_L", root, (-0.083, 0.0, 0.30))
    leg_r = empty("Leg_R", root, (0.083, 0.0, 0.30))
    parts = (body, head, arm_l, arm_r, leg_l, leg_r)
    for part in parts:
        part["semantic_part"] = part.name

    meshes = []

    def box(name, parent, at, size, material, bevel=0.012, rotation=None):
        obj = cube(
            "Avatar_" + name, (0.0, 0.0, 0.0), size, mat[material],
            bevel=bevel, parent=None, collection=collection,
        )
        obj.parent = parent
        obj.location = at
        obj.rotation_mode = "XYZ"
        if rotation is not None:
            obj.rotation_euler = rotation
        meshes.append(obj)
        return obj

    def round_part(name, parent, at, radius, depth, material, vertices=16):
        obj = cylinder(
            "Avatar_" + name, (0.0, 0.0, 0.0), radius, depth,
            mat[material], vertices=vertices, parent=None, collection=collection,
        )
        obj.parent = parent
        obj.location = at
        obj.rotation_mode = "XYZ"
        meshes.append(obj)
        return obj

    # Squared vinyl hoodie: broad chest, short sleeves and a separate ribbed hem.
    box("Hoodie", body, (0.0, 0.0, 0.185), (0.352, 0.262, 0.390), "hood_light", 0.028)
    box("Hem", body, (0.0, -0.002, 0.003), (0.360, 0.270, 0.065), "hood", 0.014)
    box("NeckLining", body, (0.0, -0.010, 0.376), (0.215, 0.190, 0.038), "orange", 0.012)
    box("Pocket", body, (0.0, -0.139, 0.105), (0.221, 0.027, 0.090), "hood", 0.012)
    box("PocketSeam", body, (0.0, -0.155, 0.139), (0.174, 0.006, 0.009), "hood_light", 0.002)

    # Short drawcords and tiny aglets give a useful close-view scale cue.
    for side, x in (("L", -0.041), ("R", 0.041)):
        length = 0.087 if side == "L" else 0.105
        box("Cord_" + side, body, (x, -0.141, 0.300 - length / 2),
            (0.011, 0.012, length), "cream", 0.003)
        box("Aglet_" + side, body, (x, -0.144, 0.300 - length),
            (0.014, 0.015, 0.022), "metal", 0.003)

    # Orange pixel lightning emblem: readable in medium shots without typography.
    for index, (x, z, width) in enumerate(((0.092, 0.263, 0.048),
                                             (0.083, 0.245, 0.039),
                                             (0.073, 0.227, 0.029))):
        box("Lightning_%02d" % index, body, (x, -0.139, z),
            (width, 0.011, 0.020), "orange", 0.002)

    # Oversized hood is the silhouette hero. Its frame keeps the face graphic,
    # retaining a deliberate voxel outline instead of a realistic human head.
    box("HoodShell", head, (0.0, 0.0, 0.110), (0.430, 0.370, 0.400), "hood", 0.042)
    box("HoodCrown", head, (0.0, 0.010, 0.303), (0.250, 0.225, 0.034), "hood_light", 0.014)
    box("HoodOpening", head, (0.0, -0.187, 0.108), (0.354, 0.021, 0.303), "charcoal", 0.025)
    box("Face", head, (0.0, -0.202, 0.105), (0.293, 0.024, 0.252), "cream", 0.020)
    for side, x in (("L", -0.207), ("R", 0.207)):
        box("HoodFold_" + side, head, (x, -0.045, 0.081),
            (0.023, 0.205, 0.218), "hood_light", 0.010)

    # Facial marks are solid shallow geometry, not image textures: no UVs or
    # external assets required, and pixels stay crisp at any export resolution.
    for side, x in (("L", -0.063), ("R", 0.063)):
        box("Eye_" + side, head, (x, -0.220, 0.143),
            (0.031, 0.014, 0.036), "charcoal", 0.002)
        box("Brow_" + side, head, (x, -0.219, 0.179),
            (0.049, 0.011, 0.012), "charcoal", 0.002)
        box("EyeGlint_" + side, head, (x - 0.006, -0.228, 0.152),
            (0.009, 0.003, 0.009), "cream", 0.001)
        box("Cheek_" + side, head, (x * 1.51, -0.218, 0.094),
            (0.025, 0.007, 0.011), "pink", 0.003)
    box("Nose", head, (0.0, -0.226, 0.109), (0.026, 0.030, 0.029), "cream", 0.006)
    box("MoustacheCentre", head, (0.0, -0.223, 0.080),
        (0.030, 0.013, 0.020), "charcoal", 0.002)
    for side, x in (("L", -0.034), ("R", 0.034)):
        box("Moustache_" + side, head, (x, -0.223, 0.071),
            (0.048, 0.013, 0.020), "charcoal", 0.002)
    box("Smile", head, (0.0, -0.222, 0.046), (0.035, 0.011, 0.009), "charcoal", 0.002)
    box("Goatee", head, (0.0, -0.221, 0.019), (0.037, 0.012, 0.027), "charcoal", 0.003)

    # Slightly asymmetric hands and a coffee cup avoid a stiff mannequin pose.
    for side, arm, sign in (("L", arm_l, -1), ("R", arm_r, 1)):
        box("Sleeve_" + side, arm, (sign * 0.010, 0.0, -0.080),
            (0.113, 0.179, 0.221), "hood_light", 0.020)
        box("Cuff_" + side, arm, (sign * 0.012, -0.005, -0.186),
            (0.115, 0.181, 0.039), "hood", 0.010)
        box("Hand_" + side, arm, (sign * 0.013, -0.018, -0.239),
            (0.083, 0.102, 0.098), "cream", 0.019)
        box("Thumb_" + side, arm, (-sign * 0.030, -0.044, -0.231),
            (0.031, 0.051, 0.046), "cream", 0.010)

    box("WatchCase", arm_l, (-0.012, -0.102, -0.173),
        (0.053, 0.022, 0.041), "charcoal", 0.006)
    box("WatchScreen", arm_l, (-0.012, -0.115, -0.173),
        (0.035, 0.006, 0.025), "cyan", 0.004)
    round_part("CoffeeCup", arm_r, (0.027, -0.112, -0.215), 0.042, 0.099, "orange")
    round_part("CoffeeSleeve", arm_r, (0.027, -0.112, -0.219), 0.043, 0.035, "cream")
    round_part("CoffeeLid", arm_r, (0.027, -0.112, -0.160), 0.046, 0.016, "charcoal")
    box("CoffeeSip", arm_r, (0.027, -0.137, -0.150),
        (0.023, 0.010, 0.005), "rubber", 0.002)

    # Flat soles sit on Z=0. Feet are deliberately oversize and point forward.
    for side, leg in (("L", leg_l), ("R", leg_r)):
        box("Trouser_" + side, leg, (0.0, 0.0, -0.101),
            (0.118, 0.150, 0.238), "charcoal", 0.014)
        box("Boot_" + side, leg, (0.0, -0.040, -0.237),
            (0.134, 0.223, 0.100), "rubber", 0.017)
        box("Sole_" + side, leg, (0.0, -0.043, -0.287),
            (0.140, 0.235, 0.026), "charcoal", 0.007)
        box("BootStripe_" + side, leg, (0.0, -0.154, -0.234),
            (0.095, 0.011, 0.018), "orange", 0.003)

    root["mesh_count"] = len(meshes)

    # Small, closed periodic motion. Root and feet stay fixed; the clothing and
    # head breathe gently. Every animated object gets one shared-name NLA track.
    # Direct action assignment is retained only if the Blender version cannot
    # create the corresponding NLA strip, so the animation never disappears.
    frames = (1, 25, 49, 73, 96)
    animated = (body, head, arm_l, arm_r)
    rest_positions = {obj.name: obj.location.copy() for obj in animated}

    for frame in frames:
        phase = (frame - 1) / 95.0 * math.tau
        breath = 0.5 - 0.5 * math.cos(phase)
        sway = math.sin(phase)
        body.location.z = rest_positions[body.name].z + 0.006 * breath
        body.rotation_euler = (0.005 * sway, 0.009 * sway, 0.009 * sway)
        head.rotation_euler = (0.016 * breath, 0.022 * sway, -0.016 * sway)
        arm_l.rotation_euler = (0.023 * sway, -0.010 * breath, 0.006 * sway)
        arm_r.rotation_euler = (-0.010 * sway, 0.006 * breath, -0.004 * sway)
        body.keyframe_insert(data_path="location", index=2, frame=frame, group="Idle")
        for obj in animated:
            obj.keyframe_insert(data_path="rotation_euler", frame=frame, group="Idle")

    for obj in animated:
        obj.location = rest_positions[obj.name]
        obj.rotation_euler = (0.0, 0.0, 0.0)
        animation = obj.animation_data
        action = animation.action
        if action is None:
            continue
        action.name = "Idle_" + obj.name
        # Blender 4.4+ may expose layered actions; the keyframe insertion above
        # supplies the correct action slot. Preserve it when creating the strip.
        slot = getattr(animation, "action_slot", None)
        track = animation.nla_tracks.new()
        track.name = "Idle"
        try:
            strip = track.strips.new("Idle", 1, action)
            if slot is not None and hasattr(strip, "action_slot"):
                strip.action_slot = slot
            strip.action_frame_start = 1.0
            strip.action_frame_end = 96.0
            strip.blend_type = "REPLACE"
            strip.extrapolation = "NOTHING"
            animation.action = None
        except (AttributeError, RuntimeError, TypeError):
            animation.nla_tracks.remove(track)
            animation.action = action

    return root
