"""Library and break-room districts for the Kroquetita city asset kit.

The only dependency is the shared Kit supplied by the scene builder. Coordinates
are local to the district, Blender Z-up, with the entrance on negative Y. Nothing
is exported or rendered by this module; all animation hooks remain named empties.
"""

from math import cos, pi, sin


def _label(k, name, words, loc, size, material="cream", parent=None):
    # Kit.text centres the font before converting it to an export-ready mesh.
    return k.text(name, words, loc, size, material, parent=parent)


def _tag(obj, **values):
    for key, value in values.items():
        obj[key] = value
    return obj


def _study_title(data, index):
    studies = data.get("education", []) if isinstance(data, dict) else []
    item = studies[index] if index < len(studies) else {}
    if not isinstance(item, dict):
        return str(item), "LIBRO %02d" % (index + 1)
    title = item.get("title", item.get("school", "Libro %02d" % (index + 1)))
    if isinstance(title, dict):
        title = title.get("es", title.get("en", "Libro %02d" % (index + 1)))
    title = str(title)
    lowered = title.lower()
    short = next((label for match, label in (
        ("electr", "ELECTRÓNICA"), ("microrred", "REDES"),
        ("wan", "WAN"), ("multiplat", "DESARROLLO"),
        ("gestión web", "WEB"), ("sage", "ERP"),
        ("bootcamp", "FULL STACK"), ("inteligencia", "IA"),
    ) if match in lowered), "LIBRO %02d" % (index + 1))
    return title, short


def _plant(k, prefix, loc, parent=None):
    x, y, z = loc
    k.cyl(prefix + "_Pot", (x, y, z + .22), .27, .42, "soil", parent=parent)
    k.link(prefix + "_Stem", (x, y, z + .37), (x, y, z + 1.15), .035, "wood", parent=parent)
    for i, (dx, dy, dz) in enumerate(((-.22, 0, .83), (.2, .08, 1.02), (0, -.12, 1.24))):
        leaf = k.ball(prefix + "_Leaf_%02d" % i, (x + dx, y + dy, z + dz), .25, "leaf", parent=parent)
        leaf.scale = (1, .65, 1.4)


def build_library(k, data):
    """A warm archive: eight climbable books, shelves, arch and reading nook."""
    k.platform((12, 12), accent="gold")
    _tag(k.root, district_id="library", asset_role="district", front_axis="-Y")
    entry = _tag(k.empty("Hook_Library_Entry", (0, -5.5, .18)), semantic_role="arrival")
    top = _tag(k.empty("Hook_Library_BookSummit", (-2.65, 2.14, 3.46)), semantic_role="arrival")
    book_roots = []
    cover_roots = []

    # Pale architectural plinths separate the archive from the neon city.
    k.box("Library_Back_Dado", (0, 5.42, .57), (11.1, .24, 1.0), "cream", .07)
    k.box("Library_Left_PlatformEdge", (-5.65, 0, .13), (.18, 10.8, .26), "wood", .04)
    k.box("Library_Right_PlatformEdge", (5.65, 0, .13), (.18, 10.8, .26), "wood", .04)

    # Every book is its own root: rotate the cover, highlight the spine, or hide
    # the whole step without binding geometry belonging to another title.
    book_colors = ("orange", "blue", "green", "purple", "gold", "cyan", "pink", "lavender")
    for i in range(8):
        z = .23 + i * .42
        y = -3.6 + i * .82
        title, short = _study_title(data, i)
        book = _tag(k.empty("Library_Book_%02d" % (i + 1), (-2.65, y, z)),
                    semantic_role="education_book", education_index=i, education_title=title)
        book_roots.append(book.name)
        color = book_colors[i]
        k.box("Book_%02d_Pages" % i, (0, 0, 0), (3.08, 1.98, .31), "paper", .025, parent=book)
        k.box("Book_%02d_CoverBottom" % i, (0, 0, -.19), (3.28, 2.12, .08), color, .045, parent=book)
        cover = k.empty("Hook_Library_Cover_%02d" % (i + 1), (-1.64, 0, .19), parent=book)
        cover_roots.append(cover.name)
        _tag(cover, semantic_role="book_cover_hinge", axis="Y")
        k.box("Book_%02d_CoverTop" % i, (1.64, 0, 0), (3.28, 2.12, .08), color, .045, parent=cover)
        k.box("Book_%02d_Spine" % i, (0, -1.025, 0), (3.25, .13, .38), color, .04, parent=book)
        _label(k, "Book_%02d_Label" % i, short, (0, -1.1, -.045), .17, "cream", parent=book)

    # Two tall bookcases create a recognizable silhouette behind the staircase.
    for side, x in (("West", -3.35), ("East", 3.35)):
        shelf = k.empty("Library_Shelf_" + side, (x, 4.65, 0))
        k.box(side + "_Back", (0, .31, 2.2), (4.05, .12, 4.4), "wood", .04, parent=shelf)
        for sx in (-1.98, 1.98):
            k.box(side + "_Pillar", (sx, 0, 2.2), (.18, .72, 4.6), "cream", .05, parent=shelf)
        for level in range(4):
            z = .12 + level * 1.4
            k.box(side + "_Shelf_%02d" % level, (0, 0, z), (4.12, .85, .14), "cream", .04, parent=shelf)
        for j in range(6):
            level = j // 2
            bx = (-1.15, .8)[j % 2]
            height = .79 + .1 * (j % 3)
            k.box(side + "_ArchiveBook_%02d" % j, (bx, -.02, .27 + level * 1.4 + height / 2),
                  (.64 + .08 * (j % 2), .62, height), book_colors[(j + (2 if side == "East" else 0)) % 8],
                  .045, parent=shelf)
        for level in range(3):
            k.box(side + "_WarmShelfLight_%02d" % level, (0, -.4, 1.49 + level * 1.4),
                  (3.72, .035, .035), "warm", .008, parent=shelf)

    # Open arch rather than a roof: it frames the district without hiding it.
    arch = k.empty("Library_MonumentalArch", (0, -4.65, 0))
    for side in (-1, 1):
        x = side * 4.8
        k.box("Library_ArchFoot", (x, 0, .15), (.85, .95, .3), "wood", .07, parent=arch)
        k.box("Library_ArchPillar", (x, 0, 1.88), (.52, .62, 3.75), "cream", .09, parent=arch)
        k.box("Library_ArchInlay", (x, -.323, 1.95), (.095, .035, 3.22), "gold", .015, parent=arch)
    for i in range(10):
        a = pi * i / 10
        b = pi * (i + 1) / 10
        k.link("Library_ArchVoussoir_%02d" % i,
               (4.8 * cos(a), 0, 3.75 + 1.4 * sin(a)),
               (4.8 * cos(b), 0, 3.75 + 1.4 * sin(b)), .26, "cream", parent=arch)
    k.box("Library_ArchNameplate", (0, -.13, 5.14), (4.7, .3, .68), "wood", .08, parent=arch)
    _label(k, "Library_Title", "ARCHIVO VIVO", (0, -.295, 4.97), .4, "warm", parent=arch)

    # Open book on a slim lectern, accessible from the plaza side.
    lectern = k.empty("Hook_Library_Read", (.75, 1.25, 0))
    _tag(lectern, semantic_role="interact", action="open_education")
    k.cyl("Library_LecternFoot", (0, 0, .1), .55, .18, "metal", parent=lectern)
    k.cyl("Library_LecternColumn", (0, 0, .64), .11, 1.05, "gold", parent=lectern)
    k.box("Library_LecternDesk", (0, 0, 1.18), (1.35, .94, .13), "wood", .055, parent=lectern)
    for side in (-1, 1):
        page = k.box("Library_OpenBook_Page", (side * .3, 0, 1.31), (.58, .75, .11), "paper", .025, parent=lectern)
        page.rotation_euler.y = side * .14
        k.box("Library_OpenBook_Text", (side * .3, -.385, 1.3), (.4, .018, .035), "gold", .006, parent=lectern)
    k.link("Library_Bookmark", (0, -.39, 1.35), (0, -.46, 1.08), .025, "orange", parent=lectern)

    # A quiet reading nook: oversized armchair, lamp, table and living plant.
    nook = k.empty("Library_ReadingNook", (3.3, .1, 0))
    k.box("Library_ChairBase", (0, 0, .32), (1.5, 1.48, .64), "wood", .12, parent=nook)
    k.box("Library_ChairCushion", (0, -.08, .76), (1.15, 1.1, .32), "cream", .14, parent=nook)
    k.box("Library_ChairBack", (0, .59, 1.25), (1.48, .34, 1.52), "cream", .15, parent=nook)
    for side in (-1, 1):
        k.box("Library_ChairArm", (side * .65, -.05, .99), (.3, 1.28, .43), "lavender", .12, parent=nook)
    k.cyl("Library_NookTable", (-1.28, -.12, .58), .45, .14, "wood", parent=nook)
    k.cyl("Library_NookTableLeg", (-1.28, -.12, .27), .09, .54, "metal", parent=nook)
    k.cyl("Library_TeaCup", (-1.28, -.14, .78), .13, .24, "cream", parent=nook)
    k.cyl("Library_LampBase", (1.13, .48, .08), .3, .12, "metal", parent=nook)
    k.link("Library_LampStem", (1.13, .48, .12), (1.13, .48, 2.65), .045, "gold", parent=nook)
    k.cyl("Library_LampShade", (1.13, .48, 2.6), .43, .42, "cream", parent=nook)
    k.ball("Library_LampGlow", (1.13, .48, 2.42), .23, "warm", parent=nook)
    _plant(k, "Library_Plant", (4.9, 2.32, 0))
    seat = k.empty("Hook_Library_Seat", (3.3, -.15, .96))
    _tag(seat, semantic_role="seat")

    return {
        "district": "library",
        "hooks": [entry.name, top.name, lectern.name, seat.name] + book_roots + cover_roots,
        "hook_roles": {"entry": entry.name, "summit": top.name, "read": lectern.name,
                       "seat": seat.name, "books": book_roots, "covers": cover_roots},
        "animation_descriptions": {
            "books": "Eight independent books with named Y-axis cover hinges; open on interaction.",
            "read": "Show validated education content when the lectern is activated.",
            "lighting": "Warm shelf strips and lamp glow can pulse gently when a book is selected.",
        },
    }


def _bug_base(k, identifier, label, position):
    root = _tag(k.empty("Breakable_" + identifier, position),
                semantic_role="breakable", breakable_id=identifier, rest_state="intact")
    k.box(identifier + "_Plinth", (0, 0, .12), (2.22, 2.03, .24), "charcoal", .06, parent=root)
    _label(k, identifier + "_Label", label, (0, -1.045, .05), .16, "cream", parent=root)
    return root


def build_bugs(k, data):
    """An open industrial playground with eleven independently breakable props."""
    k.platform((12, 12), accent="orange")
    _tag(k.root, district_id="bugs", asset_role="district", front_axis="-Y")
    entry = _tag(k.empty("Hook_Bugs_Entry", (0, -5.55, .18)), semantic_role="arrival")
    restore = _tag(k.empty("Hook_Restore", (-4.92, -4.65, 0)),
                   semantic_role="interact", action="restore_district_energy")
    k.box("Bugs_BackWall", (0, 5.5, 1.35), (11.4, .22, 2.6), "slate", .05)
    for side in (-1, 1):
        k.box("Bugs_SideCurb", (side * 5.62, .5, .425), (.2, 9.9, .85), "charcoal", .05)
        for y in (-2.7, 2.8):
            k.box("Bugs_SideStanchion", (side * 5.62, y, .8), (.34, .34, 1.6), "metal", .045)
    for i in range(8):
        stripe = k.box("Bugs_FrontHazard_%02d" % i, (-4.9 + i * 1.4, -5.66, .17),
                       (.62, .35, .055), "orange", .012)
        stripe.rotation_euler.z = -.45
    for side in (-1, 1):
        k.link("Bugs_PowerPipe", (side * 5.3, -2.5, 1.3), (side * 5.3, 4.95, 1.3), .09, "metal")
        k.link("Bugs_PipeRiser", (side * 5.3, 4.95, 1.3), (side * 5.3, 4.95, 3.35), .09, "metal")
    k.link("Bugs_BackPowerCable", (-5.3, 4.95, 3.35), (5.3, 4.95, 3.35), .065, "orange")

    # Entry portal and an open rear service balcony preserve a cutaway view.
    for side in (-1, 1):
        k.box("Bugs_PortalPillar", (side * 2.8, -5.05, 1.5), (.38, .52, 3.0), "metal", .07)
        k.box("Bugs_PortalStatus", (side * 2.8, -5.325, 1.9), (.12, .035, 1.75), "red", .014)
    k.box("Bugs_PortalHeader", (0, -5.05, 3.27), (6.0, .6, .55), "orange", .09)
    _label(k, "Bugs_Title", "DISTRITO BUGS", (0, -5.37, 3.12), .33, "charcoal")
    balcony = k.empty("Hook_Bugs_Balcony", (3.45, 4.55, 3.34))
    _tag(balcony, semantic_role="arrival")
    k.box("Bugs_BalconyDeck", (3.45, 4.55, 3.17), (4.1, 1.55, .2), "metal", .06)
    for x in (1.55, 5.35):
        k.box("Bugs_BalconyPost", (x, 4.9, 1.535), (.22, .22, 3.07), "charcoal", .04)
        k.link("Bugs_BalconyRailPost", (x, 3.88, 3.27), (x, 3.88, 3.98), .035, "metal")
    k.link("Bugs_BalconyHandrail", (1.55, 3.88, 3.98), (5.35, 3.88, 3.98), .045, "orange")
    k.link("Bugs_BalconyMidrail", (1.55, 3.88, 3.63), (5.35, 3.88, 3.63), .026, "metal")

    # A tactile relay is the anchor for the future district-wide repair quest.
    k.box("Restore_RelayCabinet", (0, 0, .62), (.85, .7, 1.24), "metal", .09, parent=restore)
    k.box("Restore_RelayDisplay", (0, -.365, .9), (.61, .035, .35), "rubber", .025, parent=restore)
    k.box("Restore_RelayEnergy", (0, -.39, .9), (.4, .025, .11), "green", .015, parent=restore)
    lever = k.empty("Hook_Restore_Lever", (.27, -.4, .48), parent=restore)
    _tag(lever, semantic_role="lever", axis="X")
    k.link("Restore_LeverShaft", (0, 0, 0), (0, -.17, .3), .035, "metal", parent=lever)
    k.ball("Restore_LeverGrip", (0, -.17, .3), .12, "orange", parent=lever)
    _label(k, "Restore_Label", "REBOOT", (0, -.37, .2), .13, "cream", parent=restore)

    roots = {}
    positions = {
        "tests": (-4.2, -2.5, 0), "network": (-1.4, -2.5, 0),
        "gauss": (1.4, -2.5, 0), "dice": (4.2, -2.5, 0),
        "graph": (-4.2, .35, 0), "prs": (-1.4, .35, 0),
        "legacy": (1.4, .35, 0), "pinata": (4.2, .35, 0),
        "stack": (-4.2, 3.2, 0), "table": (-1.4, 3.2, 0),
        "overfit": (1.4, 3.2, 0),
    }
    labels = {"tests": "TESTS", "network": "NEURONAS", "gauss": "GAUSS", "dice": "AZAR",
              "graph": "GRAFO", "prs": "PULL REQUESTS", "legacy": "LEGACY", "pinata": "PIÑATA",
              "stack": "STACK", "table": "DATOS", "overfit": "OVERFIT"}
    for identifier, position in positions.items():
        roots[identifier] = _bug_base(k, identifier, labels[identifier], position)

    r = roots["tests"]
    for i in range(6):
        k.box("tests_Piece_%02d" % i, (0, 0, .45 + i * .3), (1.0, .86, .25),
              "green" if i < 4 else "red", .045, parent=r)

    r = roots["network"]
    nodes = [(-.72, 0, .6), (-.72, 0, 1.5), (0, 0, .4), (0, 0, 1.05),
             (0, 0, 1.7), (.72, 0, .65), (.72, 0, 1.45)]
    for i, loc in enumerate(nodes):
        k.ball("network_Node_%02d" % i, loc, .16, "cyan", parent=r)
    for i, (a, b) in enumerate(((0, 2), (0, 3), (1, 3), (1, 4), (2, 5), (3, 5), (3, 6), (4, 6))):
        k.link("network_Edge_%02d" % i, nodes[a], nodes[b], .025, "metal", parent=r)

    r = roots["gauss"]
    for i, height in enumerate((.3, .5, .9, 1.4, 1.65, 1.4, .9, .5, .3)):
        k.box("gauss_Bar_%02d" % i, ((i - 4) * .21, 0, .24 + height / 2),
              (.18, .8, height), "orange", .025, parent=r)

    r = roots["dice"]
    for i, (x, y, z) in enumerate(((-.43, -.12, .64), (.43, .18, .64))):
        die = k.empty("dice_Die_%02d" % i, (x, y, z), parent=r)
        k.box("dice_Body_%02d" % i, (0, 0, 0), (.72, .72, .72), "cream", .095, parent=die)
        for j in range(3):
            k.ball("dice_Pip_%02d_%02d" % (i, j), ((j - 1) * .17, -.36, (j - 1) * .17),
                   .052, "charcoal", parent=die)

    r = roots["graph"]
    nodes = [(-.65, 0, .55), (.6, 0, .55), (0, 0, 1.2), (-.6, 0, 1.8), (.65, 0, 1.85)]
    for i, loc in enumerate(nodes):
        k.ball("graph_Node_%02d" % i, loc, .18, "purple" if i % 2 else "pink", parent=r)
    for i, (a, b) in enumerate(((0, 2), (1, 2), (2, 3), (2, 4), (3, 4), (0, 1))):
        k.link("graph_Edge_%02d" % i, nodes[a], nodes[b], .045, "metal", parent=r)

    r = roots["prs"]
    for i in range(5):
        piece = k.box("prs_Piece_%02d" % i, (0, 0, .36 + i * .23), (1.48, 1.1, .18),
                      "paper" if i % 2 else "blue", .035, parent=r)
        piece.rotation_euler.z = (-1 if i % 2 else 1) * .09

    r = roots["legacy"]
    k.box("legacy_Monolith", (0, 0, 1.35), (1.35, 1.05, 2.2), "charcoal", .11, parent=r)
    for i in range(4):
        k.box("legacy_ServerBlade_%02d" % i, (0, -.55, .6 + i * .43),
              (1.1, .09, .27), "metal", .025, parent=r)
    k.box("legacy_ErrorScreen", (0, -.56, 2.12), (.77, .06, .22), "red", .025, parent=r)
    _label(k, "legacy_Years", "1999", (0, -.604, 1.97), .13, "cream", parent=r)

    r = roots["pinata"]
    for x in (-.8, .8):
        k.link("pinata_Post", (x, 0, .26), (x, 0, 2.2), .075, "metal", parent=r)
    k.link("pinata_Crossbar", (-.8, 0, 2.2), (.8, 0, 2.2), .075, "orange", parent=r)
    k.link("pinata_Rope", (0, 0, 2.2), (0, 0, 1.67), .025, "rubber", parent=r)
    k.ball("pinata_BugBody", (0, 0, 1.23), .47, "pink", parent=r)
    k.box("pinata_Stripe", (0, -.41, 1.22), (.7, .09, .19), "orange", .04, parent=r)

    r = roots["stack"]
    for i in range(6):
        k.box("stack_Frame_%02d" % i, (.06 * (i % 2), 0, .37 + i * .29),
              (1.24, .9, .2), "orange" if i == 5 else "metal", .045, parent=r)

    r = roots["table"]
    for row in range(4):
        for col in range(3):
            k.box("table_Cell_%02d_%02d" % (row, col), ((col - 1) * .5, 0, .42 + row * .32),
                  (.46, .43, .28), "orange" if row == 3 else ("cyan" if (row + col) % 2 else "metal"),
                  .025, parent=r)

    r = roots["overfit"]
    k.link("overfit_AxisX", (-.83, 0, .4), (.87, 0, .4), .035, "metal", parent=r)
    k.link("overfit_AxisZ", (-.83, 0, .4), (-.83, 0, 1.9), .035, "metal", parent=r)
    curve = [(-.76, -.04, .6), (-.48, -.04, 1.45), (-.2, -.04, .88),
             (.08, -.04, 1.75), (.36, -.04, 1.05), (.64, -.04, 1.55), (.84, -.04, 1.0)]
    for i in range(len(curve) - 1):
        k.link("overfit_Curve_%02d" % i, curve[i], curve[i + 1], .055, "red", parent=r)
    for i in range(4):
        k.ball("overfit_Data_%02d" % i, (-.6 + i * .4, -.07, .68 + i * .25), .085, "cyan", parent=r)

    # A friendly maintenance-bug boss, deliberately readable as a toy.
    boss = _tag(k.empty("Hook_Bugs_Boss", (4.2, 3.0, 0)), semantic_role="boss", animation_ready=True)
    k.box("Boss_Body", (0, 0, .88), (.95, .72, .83), "orange", .18, parent=boss)
    head = k.empty("Hook_Bugs_BossHead", (0, -.02, 1.63), parent=boss)
    k.box("Boss_Head", (0, 0, 0), (1.14, .8, .68), "charcoal", .16, parent=head)
    for side in (-1, 1):
        k.ball("Boss_Eye", (side * .25, -.415, .02), .12, "cyan", parent=head)
        k.box("Boss_Boot", (side * .3, -.07, .155), (.38, .61, .31), "rubber", .09, parent=boss)
        k.box("Boss_Leg", (side * .3, 0, .39), (.22, .24, .16), "metal", .04, parent=boss)
        k.link("Boss_Arm", (side * .47, 0, 1.06), (side * .81, -.18, .82), .09, "metal", parent=boss)
        k.ball("Boss_Hand", (side * .82, -.18, .81), .15, "cream", parent=boss)
    k.link("Boss_Antenna", (0, 0, .34), (0, 0, .68), .035, "metal", parent=head)
    k.ball("Boss_AntennaTip", (0, 0, .73), .11, "red", parent=head)
    # Stylized solid smoke puffs: no simulation, particles, volumetrics or rig dependency.
    for i in range(3):
        puff = k.ball("Bugs_StaticSteam_%02d" % i, (-4.75 + i * .16, 4.7, 2.7 + i * .49),
                      .22 + i * .07, "slate")
        puff.scale = (1, 1, 1.2)

    return {
        "district": "bugs",
        "hooks": [entry.name, restore.name, lever.name, balcony.name, boss.name, head.name]
                 + [obj.name for obj in roots.values()],
        "hook_roles": {"entry": entry.name, "restore": restore.name, "restore_lever": lever.name,
                       "balcony": balcony.name, "boss": boss.name, "boss_head": head.name,
                       "breakables": {key: obj.name for key, obj in roots.items()}},
        "animation_descriptions": {
            "tests": "Knock the six tower pieces down, then rebuild from their saved transforms.",
            "network": "Scatter node spheres while fading or shortening their independent edges.",
            "gauss": "Flatten the nine histogram bars in a left-to-right wave.",
            "dice": "Roll the two named die roots; pips remain attached to their die.",
            "graph": "Pop graph nodes and retract edge cylinders.",
            "prs": "Fan the five request slabs outwards and restack them.",
            "legacy": "Shake the server monolith; eject four blades on the final hit.",
            "pinata": "Swing the body beneath the rope and burst into authored pieces later.",
            "stack": "Grow or collapse the six call-frame slabs.",
            "table": "Scatter the twelve table cells and reconstruct the grid.",
            "overfit": "Loosen the red curve segments into a simpler fitted path.",
            "restore": "Rotate the lever around local X and restore relay/portal status materials.",
            "boss": "Bob the root and turn the separate head; no skeletal rig is required.",
        },
    }
