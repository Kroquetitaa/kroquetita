"""Factory and AI laboratory districts for the Blender city pilot.

Only this module's builders create objects. Coordinates are local to Kit.root:
Blender +Z up, -Y toward the visitor, one unit per metre. No lights, cameras,
files, scene changes, or external assets are created here.
"""
import math


def _hook(k, name, location, purpose):
    obj = k.empty(name, location)
    obj["interaction_hook"] = purpose
    return obj.name


def _text(k, name, words, location, size=.17, material="cream", parent=None):
    return k.text(name, words, location, size, material, parent=parent)


def _loop_action(obj, coordinates, clip="Factory_Conveyor"):
    """Bake a closed 96-frame loop on a child; its static parent keeps its pose."""
    rest = coordinates[0]
    for frame, coordinate in enumerate(coordinates, 1):
        obj.location = tuple(coordinate[i] - rest[i] for i in range(3))
        obj.keyframe_insert(data_path="location", frame=frame, group=clip)
    animation = obj.animation_data
    action = animation.action
    if action is None:
        raise RuntimeError("Conveyor keyframe creation did not produce an action")
    action.name = clip + "_" + obj.name
    # Linear interpolation prevents easing at every sampled belt position.
    if hasattr(action, "fcurves"):
        curves = action.fcurves
    else:
        curves = []
        slot = animation.action_slot
        for layer in action.layers:
            for strip in layer.strips:
                if hasattr(strip, "channelbag"):
                    bag = strip.channelbag(slot)
                    if bag:
                        curves.extend(bag.fcurves)
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    slot = getattr(animation, "action_slot", None)
    track = animation.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    if slot is not None and hasattr(strip, "action_slot"):
        strip.action_slot = slot
    strip.action_frame_start = 1
    strip.action_frame_end = 96
    strip.blend_type = "REPLACE"
    strip.extrapolation = "NOTHING"
    animation.action = None
    obj.location = (0, 0, 0)


def _belt_point(progress):
    """A rounded closed racetrack; the visible front lane moves left to right."""
    radius, half, y, z = .58, 4.30, -1.02, 1.00
    straight = half * 2
    semicircle = math.pi * radius
    distance = (progress % 1.0) * (2 * straight + 2 * semicircle)
    if distance < straight:
        return (-half + distance, y - radius, z)
    distance -= straight
    if distance < semicircle:
        angle = -math.pi / 2 + distance / radius
        return (half + radius * math.cos(angle), y + radius * math.sin(angle), z)
    distance -= semicircle
    if distance < straight:
        return (half - distance, y + radius, z)
    distance -= straight
    angle = math.pi / 2 + distance / radius
    return (-half + radius * math.cos(angle), y + radius * math.sin(angle), z)


def _robot_arm(k, prefix, x, y, mirrored=False):
    direction = -1 if mirrored else 1
    a = (x, y, 1.02)
    b = (x + .34 * direction, y, 2.05)
    c = (x + .87 * direction, y - .44, 1.77)
    k.cyl(prefix + "_Foot", (x, y, .34), .38, .68, "purple")
    k.cyl(prefix + "_Turntable", (x, y, .75), .29, .15, "orange")
    k.link(prefix + "_Upper", a, b, .13, "cream")
    k.link(prefix + "_Forearm", b, c, .11, "cream")
    for index, point in enumerate((a, b, c)):
        k.ball(prefix + "_Joint_" + str(index), point, .18, "orange")
    for side in (-1, 1):
        k.box(prefix + "_Gripper", (c[0] + side * .13, c[1], c[2] - .22),
              (.09, .15, .37), "charcoal", bevel=.015)


def build_factory(k, data):
    """13 x 12 m open toy factory: question -> retrieval -> agents -> croquette."""
    k.platform((13, 12), accent="orange")
    k.root["district"] = "AI croquette factory"
    k.root["footprint"] = "13 x 12 metres"

    # Two-sided cutaway shell: large silhouettes, but no roof hiding the process.
    k.box("Factory_BackWall", (0, 5.15, 1.90), (12.0, .22, 3.8), "purple", bevel=.08)
    k.box("Factory_LeftWall", (-5.88, 2.35, 1.30), (.22, 5.45, 2.6), "lavender", bevel=.06)
    for x in (-5.82, 5.82):
        for y in (-3.95, 4.95):
            k.box("Factory_Pier", (x, y, 2.1), (.28, .28, 4.2), "orange", bevel=.04)
    k.box("Factory_BackBeam", (0, 4.95, 4.13), (11.9, .34, .30), "orange")
    for x in (-5.82, 5.82):
        k.box("Factory_SideBeam", (x, .50, 4.13), (.34, 9.2, .30), "orange")
    k.box("Factory_TitleBoard", (0, 4.995, 3.08), (7.8, .09, .85), "charcoal")
    _text(k, "Factory_Title", "LA FABRICA DE IDEAS", (0, 4.925, 3.10), .43)
    _text(k, "Factory_Subtitle", "PREGUNTAR  /  CONECTAR  /  CREAR", (0, 4.91, 2.78), .16, "orange")
    for x in (-4.7, 4.7):
        k.cyl("Factory_Stack", (x, 4.25, 3.22), .30, 2.80, "charcoal", vertices=12)
        k.cyl("Factory_StackCollar", (x, 4.25, 4.57), .37, .18, "orange", vertices=12)
        k.cyl("Factory_StackCap", (x, 4.25, 4.77), .45, .12, "cream", vertices=12)
    for index, x in enumerate((-3.3, -2.85, -2.4)):
        k.link("Factory_ServicePipe", (x, 4.7, .1), (x, 4.7, 2.4), .075, "cyan")

    # Hopper: sloping plates clearly form the input funnel rather than a cube.
    k.box("Input_HopperStand", (-4.65, 1.40, .55), (.90, .85, 1.1), "charcoal")
    k.box("Input_HopperThroat", (-4.65, 1.40, 1.20), (.60, .60, .25), "orange")
    for side in (-1, 1):
        plate = k.box("Input_FunnelSide", (-4.65 + side * .43, 1.40, 1.70),
                      (.10, 1.22, 1.05), "orange")
        plate.rotation_euler.y = side * -.32
        plate = k.box("Input_FunnelCross", (-4.65, 1.40 + side * .43, 1.70),
                      (1.22, .10, 1.05), "lavender")
        plate.rotation_euler.x = side * .32
    _text(k, "Input_QuestionMark", "?", (-4.65, .87, 1.70), .70, "cream")
    k.box("Input_Discharge", (-4.65, .25, .98), (.65, 1.15, .12), "metal")

    # Raised rounded belt and low supports. Its returning lane remains visible.
    k.box("Conveyor_Frame", (0, -1.02, .70), (10.2, 1.80, .30), "purple", bevel=.16)
    k.box("Conveyor_Belt", (0, -1.02, .90), (9.7, 1.55, .10), "rubber", bevel=.30)
    for y in (-1.94, -.10):
        k.box("Conveyor_Rail", (0, y, .90), (10.0, .075, .10), "orange")
    for x in (-4.3, -1.6, 1.6, 4.3):
        k.box("Conveyor_Foot", (x, -1.02, .32), (.23, 1.1, .64), "charcoal")
    for x in (-4.45, -3.2, -1.9, -.6, .7, 2, 3.3, 4.45):
        k.cyl("Conveyor_Roller", (x, -1.02, .79), .09, 1.60, "metal",
              rotation=(math.pi/2, 0, 0))

    # Four reusable loads move on child nodes; static anchors provide valid rest poses.
    for index in range(4):
        points = [_belt_point(index / 4 + frame / 95) for frame in range(96)]
        anchor = k.empty("Conveyor_Anchor_%02d" % index, points[0])
        item = k.empty("Conveyor_Load_%02d" % index, (0, 0, 0), parent=anchor)
        k.box("Conveyor_Tray_%02d" % index, (0, 0, .08), (.52, .42, .12),
              "metal", bevel=.025, parent=item)
        for side in (-1, 1):
            k.box("Conveyor_Token_%02d" % index, (side * .11, 0, .22), (.18, .23, .18),
                  "cyan" if index % 2 == 0 else "orange", bevel=.04, parent=item)
        _loop_action(item, points)

    # Tokenizer gate and retrieval rack make the pipeline readable from the front.
    for x in (-2.70, -1.85):
        k.box("Tokenizer_Post", (x, -.90, 1.36), (.13, .20, .90), "cream")
    k.box("Tokenizer_Bar", (-2.275, -.90, 1.88), (1.05, .25, .18), "orange")
    k.box("Tokenizer_Sensor", (-2.275, -.90, 1.67), (.10, .10, .18), "cyan")
    k.box("Retrieval_Rack", (-.15, 1.45, 1.00), (1.65, .76, 2.0), "purple")
    for row in range(3):
        k.box("Retrieval_Shelf", (-.15, .99, .44 + row * .48), (1.76, 1.0, .07), "cream")
        document = k.box("Retrieval_Document", (-.17 + .08 * row, .77, .68 + row * .48),
                         (.92, .11, .38), "paper", bevel=.015)
        document.rotation_euler.y = (-1 if row % 2 else 1) * .10
    _text(k, "Retrieval_Index", "FUENTES", (-.15, 1.04, 1.83), .16, "orange")
    _robot_arm(k, "Agent_Left", 1.65, 1.0)
    _robot_arm(k, "Agent_Right", 3.70, 1.7, mirrored=True)

    # The final answer is a big friendly croquette, framed as a physical product.
    k.cyl("Output_Podium", (4.6, 2.75, .23), 1.04, .46, "purple", vertices=16)
    croquette = k.box("Output_Croquette", (4.6, 2.75, 1.32), (1.42, 1.08, 1.70),
                     "gold", bevel=.42)
    croquette["semantic_role"] = "finished answer / friendly croquette"
    for side in (-1, 1):
        k.ball("Output_Eye", (4.6 + side * .23, 2.196, 1.48), .078, "charcoal")
        k.box("Output_Foot", (4.6 + side * .38, 2.50, .49), (.35, .55, .18), "orange", bevel=.08)
    _text(k, "Output_Smile", "u", (4.6, 2.187, 1.25), .24, "charcoal")
    for dx, dz in ((-.46, .18), (.39, .30), (-.36, -.40), (.33, -.36), (.07, .59)):
        k.box("Output_CrispCrumb", (4.6 + dx, 2.19, 1.32 + dz), (.11, .035, .10),
              "orange", bevel=.025)

    for index, (x, title) in enumerate(((-4.6, "01 / PREGUNTA"), (-2.3, "02 / TOKENS"),
                                       (0, "03 / DOCUMENTOS"), (2.3, "04 / AGENTES"),
                                       (4.6, "05 / RESPUESTA"))):
        k.box("Factory_ProcessLabel", (x, -2.05, .55), (2.12, .07, .30), "charcoal")
        _text(k, "Factory_ProcessText", title, (x, -2.095, .55), .13, "cream")
    for x in (-4.7, -3.7, -2.7, -1.7, -.7, .3, 1.3, 2.3, 3.3, 4.3):
        stripe = k.box("Factory_CautionStripe", (x, -3.0, .016), (.36, .10, .032), "orange", bevel=.005)
        stripe.rotation_euler.z = -.60
    k.box("Factory_VisitorBench", (-3.6, -4.35, .45), (2.5, .62, .18), "lavender")
    for x in (-4.35, -2.85):
        k.box("Factory_BenchLeg", (x, -4.35, .19), (.19, .46, .38), "charcoal")

    hooks = {
        "input": _hook(k, "Hook_Input", (-4.65, .15, 1.10), "submit a question to the factory"),
        "retrieval": _hook(k, "Hook_Retrieval", (-.15, .45, 1.40), "inspect retrieved sources"),
        "agents": _hook(k, "Hook_Agents", (2.5, .15, 1.65), "inspect cooperating robot agents"),
        "output": _hook(k, "Hook_Output", (4.6, 1.65, 1.35), "inspect the finished answer"),
    }
    return {"hooks": hooks, "animations": {"Factory_Conveyor": "Four payloads follow a closed belt, frames 1-96; district root stays fixed."}}


def _table(k, prefix, title, x, y):
    k.box(prefix + "_Pedestal", (x, y, .32), (2.30, 1.70, .64), "cream", bevel=.08)
    k.box(prefix + "_Tray", (x, y, .68), (2.46, 1.84, .12), "charcoal", bevel=.07)
    _text(k, prefix + "_Title", title, (x, y - .865, .34), .145, "purple")
    return (x, y, .78)


def _tiny_bot(k, prefix, x, y, z, accent="cyan"):
    k.box(prefix + "_Body", (x, y, z + .12), (.23, .22, .25), accent, bevel=.04)
    k.box(prefix + "_Head", (x, y, z + .36), (.33, .26, .22), "cream", bevel=.05)
    k.box(prefix + "_Visor", (x, y - .139, z + .37), (.21, .025, .07), "charcoal", bevel=.015)


def build_lab(k, data):
    """14 x 12 m cyan/cream pavilion with twelve distinct explanatory exhibits."""
    k.platform((14, 12), accent="cyan")
    k.root["district"] = "Interactive AI concept laboratory"
    k.root["footprint"] = "14 x 12 metres"
    for x in (-6.45, 6.45):
        k.box("Lab_ArchPier", (x, 4.95, 1.80), (.35, .35, 3.6), "cream", bevel=.07)
    k.box("Lab_ArchHeader", (0, 4.95, 3.55), (13.25, .40, .36), "cream", bevel=.07)
    k.box("Lab_CyanHeader", (0, 4.72, 3.55), (12.6, .06, .085), "cyan", bevel=.018)
    k.box("Lab_TitlePlate", (0, 4.75, 2.90), (6.6, .08, .69), "purple")
    _text(k, "Lab_Title", "LABORATORIO DE IA", (0, 4.69, 2.94), .39)
    _text(k, "Lab_Subtitle", "12 IDEAS QUE PUEDES TOCAR", (0, 4.68, 2.67), .15, "cyan")
    for x in (-6.45, 6.45):
        k.box("Lab_LowBoundary", (x, .2, .14), (.12, 8.8, .28), "cream")
    for y in (-4.65, -1.62, 1.63):
        k.box("Lab_AisleLight", (0, y, .012), (11.90, .045, .024), "cyan", bevel=.007)

    concepts = [
        ("neural", "01 / RED NEURONAL"), ("graph", "02 / CONOCIMIENTO"),
        ("vectors", "03 / VECTORES"), ("attention", "04 / ATENCION"),
        ("rag", "05 / RAG"), ("agents", "06 / AGENTES"),
        ("gradient", "07 / GRADIENTE"), ("diffusion", "08 / DIFUSION"),
        ("mcp", "09 / MCP"), ("multiagent", "10 / MULTIAGENTE"),
        ("rl", "11 / REFUERZO"), ("lora", "12 / LORA"),
    ]
    hooks = {}
    for index, (concept, title) in enumerate(concepts):
        x = (-4.80, -1.60, 1.60, 4.80)[index % 4]
        y = (3.15, -.05, -3.25)[index // 4]
        p = "Exhibit_" + concept
        _, _, z = _table(k, p, title, x, y)
        hooks[concept] = _hook(k, "Hook_Concept_" + concept, (x, y - 1.12, z + .42), title)

        if concept == "neural":
            layers = []
            for col, count in enumerate((2, 3, 2)):
                points = [(x - .75 + .75 * col, y, z + .20 + .38 * j + (3-count)*.19)
                          for j in range(count)]
                layers.append(points)
                for point in points:
                    k.ball(p + "_Neuron", point, .12, "cyan" if col != 1 else "orange")
            for left, right in zip(layers, layers[1:]):
                for a in left:
                    for b in right:
                        k.link(p + "_Weight", a, b, .022, "metal")

        elif concept == "graph":
            points = [(x, y, z+.74), (x-.78,y-.12,z+.25), (x+.77,y-.10,z+.25),
                      (x-.62,y+.16,z+1.1), (x+.65,y+.10,z+1.18)]
            for j, point in enumerate(points):
                k.ball(p + "_Entity", point, .15 if j else .20, "cyan" if j % 2 else "orange")
                if j:
                    k.link(p + "_Relation", points[0], point, .036, "purple")
            k.link(p + "_CrossRelation", points[1], points[3], .026, "metal")

        elif concept == "vectors":
            origin = (x-.66, y-.42, z+.08)
            for end, color in (((x+.85,y-.42,z+.08),"orange"),
                               ((x-.66,y+.58,z+.08),"green"),
                               ((x-.66,y-.42,z+1.20),"cyan")):
                k.link(p + "_Axis", origin, end, .028, color)
                k.ball(p + "_AxisEnd", end, .065, color)
            end = (x+.55,y+.24,z+.92)
            k.link(p + "_Embedding", origin, end, .055, "purple")
            k.box(p + "_EmbeddingPoint", end, (.20,.20,.20), "orange", bevel=.04)

        elif concept == "attention":
            k.box(p + "_MatrixBack", (x,y+.12,z+.66), (1.5,.12,1.40), "purple")
            for row in range(3):
                for col in range(3):
                    color = "orange" if row == col else "cyan" if col == 1 else "lavender"
                    k.box(p + "_AttentionCell", (x-.46+col*.46,y+.025,z+.2+row*.43),
                          (.36,.12,.33), color, bevel=.025)
            for col in range(3):
                k.box(p + "_Token", (x-.46+col*.46,y-.50,z+.12), (.31,.26,.20), "cream")

        elif concept == "rag":
            for j in range(3):
                k.cyl(p + "_Corpus", (x-.67,y+.10,z+.12+j*.18), .27,.14,"purple",vertices=12)
                k.box(p + "_Document", (x-.02+j*.035,y-.05+j*.08,z+.39+j*.12),
                      (.39,.055,.52), "paper", bevel=.008)
            k.box(p + "_GroundedAnswer", (x+.69,y+.02,z+.54), (.43,.17,.75), "cyan")
            k.link(p + "_Retrieve", (x-.4,y-.22,z+.3), (x-.05,y-.22,z+.4), .035,"orange")
            k.link(p + "_Generate", (x+.24,y-.22,z+.5), (x+.48,y-.22,z+.54), .035,"orange")
            _text(k,p+"_Citation","[1]",(x+.69,y-.08,z+.55),.18,"charcoal")

        elif concept == "agents":
            for j, color in enumerate(("orange","cyan","purple")):
                _tiny_bot(k,p+"_Agent"+str(j),x-.68+j*.68,y,z+.06,color)
            for a in (-.48,.20):
                k.link(p+"_Handoff",(x+a,y-.35,z+.34),(x+a+.28,y-.35,z+.34),.035,"metal")
            k.box(p+"_TaskCard",(x,y+.45,z+.48),(.50,.10,.60),"paper")

        elif concept == "gradient":
            for ix in range(3):
                for iy in range(3):
                    h = .07 + .23*((ix-1)**2+(iy-1)**2)
                    k.box(p+"_LossSurface",(x+(ix-1)*.51,y+(iy-1)*.43,z+h/2),
                          (.47,.39,h),"cyan" if h < .3 else "blue",bevel=.025)
            route = [(x-.51,y-.43,z+.63),(x-.20,y-.28,z+.42),(x,y,z+.20)]
            for a,b in zip(route,route[1:]):
                k.link(p+"_Descent",a,b,.037,"orange")
            k.ball(p+"_Minimum",route[-1],.105,"green")

        elif concept == "diffusion":
            for panel in range(3):
                cx=x-.73+panel*.73
                k.box(p+"_Frame",(cx,y+.10,z+.61),(.63,.09,1.03),"purple")
                if panel == 0:
                    for j,(dx,dz) in enumerate(((-.17,.25),(.17,.25),(0,.43),(-.17,.61),
                                                (.17,.61),(0,.80),(-.17,.96),(.17,.96))):
                        k.box(p+"_Noise",(cx+dx,y+.035,z+dz),(.12,.055,.12),
                              "cyan" if j%2 else "orange",bevel=.008)
                elif panel == 1:
                    for dx,dz,color in ((0,.36,"cyan"),(0,.57,"cyan"),(-.15,.72,"orange"),
                                        (.15,.72,"orange"),(0,.89,"orange")):
                        k.box(p+"_Denoise",(cx+dx,y+.035,z+dz),(.17,.055,.17),color,bevel=.015)
                else:
                    k.box(p+"_Stem",(cx,y+.025,z+.42),(.06,.07,.42),"green",bevel=.01)
                    for dx,dz in ((-.14,.73),(.14,.73),(0,.91),(0,.58)):
                        k.box(p+"_Petal",(cx+dx,y+.025,z+dz),(.16,.07,.16),"orange",bevel=.045)
                    k.box(p+"_FlowerCentre",(cx,y-.005,z+.74),(.14,.08,.14),"cream",bevel=.04)

        elif concept == "mcp":
            k.cyl(p+"_ConnectorHub",(x,y,z+.36),.24,.65,"purple",vertices=12)
            destinations=[(x-.76,y-.25,z+.33),(x+.75,y-.25,z+.33),(x,y+.57,z+.35)]
            for j,end in enumerate(destinations):
                k.link(p+"_ToolCable",(x,y,z+.50),end,.035,"cyan")
                if j==0:
                    k.box(p+"_Computer",end,(.43,.12,.33),"charcoal")
                    k.box(p+"_Screen",(end[0],end[1]-.07,end[2]),(.33,.03,.23),"cyan")
                elif j==1:
                    for level in range(2):
                        k.cyl(p+"_Database",(end[0],end[1],end[2]-.1+level*.22),.23,.18,"orange",vertices=12)
                else:
                    k.box(p+"_FileTool",end,(.39,.13,.50),"paper")
                    k.box(p+"_FileTab",(end[0]-.1,end[1],end[2]+.29),(.19,.13,.10),"orange")

        elif concept == "multiagent":
            center=(x,y,z+.49)
            k.ball(p+"_SharedGoal",center,.19,"orange")
            for j,(dx,dy) in enumerate(((-.70,0),(.70,0),(0,-.51),(0,.51))):
                _tiny_bot(k,p+"_Team"+str(j),x+dx,y+dy,z+.04,"cyan" if j%2 else "purple")
                k.link(p+"_Coordination",center,(x+dx,y+dy,z+.28),.024,"metal")

        elif concept == "rl":
            for ix in range(3):
                for iy in range(3):
                    k.box(p+"_MazeCell",(x+(ix-1)*.52,y+(iy-1)*.43,z+.045),(.49,.40,.09),
                          "cyan" if (ix+iy)%2 else "paper",bevel=.01)
            for dx,dy,sx,sy in ((-.25,.1,.06,.57),(.28,-.35,.06,.54),(.26,.37,.52,.06)):
                k.box(p+"_MazeWall",(x+dx,y+dy,z+.20),(sx,sy,.30),"purple",bevel=.012)
            k.ball(p+"_Explorer",(x-.52,y-.43,z+.22),.14,"orange")
            k.link(p+"_GoalPole",(x+.52,y+.43,z+.10),(x+.52,y+.43,z+.67),.025,"metal")
            k.box(p+"_RewardFlag",(x+.68,y+.43,z+.57),(.31,.04,.20),"green",bevel=.01)

        elif concept == "lora":
            frozen=[]
            for col in range(2):
                points=[(x-.70+col*.90,y+.13,z+.25+j*.35) for j in range(3)]
                frozen.append(points)
                for point in points:
                    k.ball(p+"_FrozenWeight",point,.105,"blue")
            for j in range(3):
                k.link(p+"_FrozenPath",frozen[0][j],frozen[1][j],.025,"metal")
            k.box(p+"_AdapterA",(x-.25,y-.34,z+.38),(.33,.18,.38),"orange")
            k.box(p+"_AdapterB",(x+.25,y-.34,z+.68),(.33,.18,.38),"orange")
            for a,b in ((frozen[0][0],(x-.25,y-.34,z+.38)),
                        ((x-.25,y-.34,z+.38),(x+.25,y-.34,z+.68)),
                        ((x+.25,y-.34,z+.68),frozen[1][2])):
                k.link(p+"_TrainablePath",a,b,.035,"orange")

    # Three mission relays live on one front console, accessible without a maze.
    k.box("Lab_RelayConsole",(0,-5.30,.45),(4.25,.55,.90),"purple",bevel=.08)
    for index,(name,label) in enumerate((("Hook_Power_Core","ENERGIA"),
                                        ("Hook_Power_Data","DATOS"),
                                        ("Hook_Power_Link","ENLACE"))):
        x=(index-1)*1.30
        k.box("Relay_Socket",(x,-5.61,.58),(.78,.065,.32),"charcoal",bevel=.025)
        k.cyl("Relay_Switch",(x-.23,-5.66,.58),.105,.055,"orange",
              rotation=(math.pi/2,0,0),vertices=12)
        _text(k,"Relay_Label",label,(x+.14,-5.655,.58),.10,"cyan")
        hooks[name]=_hook(k,name,(x,-5.70,.60),"mission power relay: "+label.lower())
    return {"hooks":hooks,"animations":{},
            "exhibits":[concept for concept,_ in concepts],
            "mission_relays":["Hook_Power_Core","Hook_Power_Data","Hook_Power_Link"]}
