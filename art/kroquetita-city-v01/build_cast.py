"""Bake the complete existing cast into editable, bevelled Blender models.
Y-up helper coordinates match the game's original joints and physics scale.
Run: blender --background --factory-startup --python build_cast.py
"""
import bpy, sys, json, math
from mathutils import Vector
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import Kit, make_materials, subtree, material, light, camera
OUT=HERE/'cast'; OUT.mkdir(exist_ok=True)
WEB=HERE/'cast/exports'; WEB.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0

def build(name,color='#7463a4',accent='#ffb347',kind='human'):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if not col.objects and not col.children: bpy.data.collections.remove(col)
    k=Kit('Actor',make_materials());k.root.name='Actor'
    k.root['cast_revision']='toy-vinyl-detail-v2'
    def at(v): return (v[0],-v[2],v[1])
    def group(n,p=(0,0,0),parent=None): return k.empty(n,at(p),parent)
    def box(n,p,s,m,parent=None,r=.025):
        obj=k.box(n,at(p),(s[0],s[2],s[1]),m,min(r,min(s)*.3),parent)
        # Two bevel segments on silhouettes, one on fine details: toy edges without excess triangles.
        for mod in obj.modifiers:
            if mod.type=='BEVEL': mod.segments=2 if min(s)>.055 else 1
        return obj
    def ball(n,p,r,m,parent=None): return k.ball(n,at(p),r,m,1,parent)
    def link(n,a,b,r,m,parent=None): return k.link(n,at(a),at(b),r,m,parent)
    def tilt(obj,angle): obj.rotation_euler.y=math.radians(angle); return obj
    if kind=='human' or kind=='ai':
        body=group('Body');box('Jacket',(0,.51,0),(.44,.44,.30),color,body,.045)
        box('ChestBadge',(0,.56,.157),(.19,.055,.02),accent,body)
        for n,x in [('Leg_L',-.11),('Leg_R',.11)]:
            leg=group(n,(x,.30,0));box(n+'_trouser',(0,-.13,0),(.15,.28,.19),'charcoal',leg)
            box(n+'_shoe',(0,-.26,.035),(.17,.10,.26),'rubber',leg)
        head=group('Head',(0,.96,0));skin=color if kind=='ai' else '#f1d9c5'
        box('Face',(0,0,0),(.44,.42,.40),skin,head,.045)
        if kind=='ai': box('Visor',(0,0,.202),(.35,.25,.02),'rubber',head)
        eyes=group('Eyes',(0,0,0),head)
        for x in [-.1,.1]: box('Eye',(x,.035,.205),(.055,.075,.025),'light' if kind=='ai' else 'rubber',eyes,.01)
        box('Smile',(0,-.095,.207),(.12,.022,.018),'rubber',head,.006)
        hair={'recruiter':'#5a2d1a','guide':'#70402b','qa':'#22252e','sysadmin':'#3a2a20','intern':'#c9862e','librarian':'#c9ccd3','alex':'#2a1b12','josete':'#1c1c22','cristian':'#3b2416','pablo':'#8a5a2b','joseba':'#27202f','pochita':'#5c2b27','manager':'#3a2a1e'}.get(name,'charcoal')
        if kind=='human':
            box('Hair',(0,.21,-.03),(.48,.12,.44),hair,head)
            box('HairSide',(-.19,.10,-.02),(.09,.25,.40),hair,head)
        if name in ['guide','pablo','Qwen3']:
            box('Cap',(0,.24,0),(.49,.10,.45),accent,head)
            box('CapBrim',(0,.20,.25),(.43,.035,.22),accent,head)
        if name in ['qa','cristian','librarian','manager']:
            for x in [-.1,.1]:
                box('GlassesTop',(x,.075,.223),(.17,.025,.025),'charcoal',head)
                box('GlassesBottom',(x,-.012,.223),(.17,.022,.025),'charcoal',head)
            box('GlassesBridge',(0,.035,.227),(.08,.025,.03),'charcoal',head)
        if name in ['joseba','sysadmin']:
            box('Hood',(0,.02,-.07),(.51,.50,.38),color,head,.05)
            # The old hair top was coplanar with the hood top, causing a black z-fighting patch.
            bpy.data.objects['Hair'].location.z=.17
            box('HoodFringe',(0,.17,.185),(.31,.08,.07),hair,head,.014)
        if name=='pochita':
            for x in [-.28,.28]: ball('Ponytail',(x,.15,-.08),.13,hair,head)
        if name=='ChatGPT':
            for x in [-.245,.245]: box('Headphone',(x,0,0),(.08,.22,.18),'cream',head)
            box('Headband',(0,.25,0),(.5,.045,.10),'cream',head)
        if name=='Gemini':
            for x in [-.12,.12]:
                box('Antenna',(x,.30,0),(.025,.22,.025),'metal',head);ball('AntennaLight',(x,.42,0),.06,accent,head)
        if name=='Mistral': box('Beret',(0,.24,0),(.51,.12,.45),accent,head)
        arms=group('Arms',(0,.62,0))
        for n,x in [('Arm_L',-.28),('Arm_R',.28)]:
            arm=group(n,(x,0,0),arms);box(n+'_sleeve',(0,-.1,0),(.12,.31,.16),color,arm)
            box(n+'_hand',(0,-.27,.01),(.115,.10,.13),skin,arm)
            if x>0 and name in ['recruiter','cristian','qa','manager']:
                box('Tablet',(0,-.26,.12),(.24,.31,.035),'charcoal' if name in ['recruiter','cristian'] else 'wood',arm)
                box('Screen',(0,-.25,.142),(.18,.23,.012),accent,arm)
            if x>0 and name in ['pablo','sysadmin']:
                k.cyl('Mug',at((0,-.24,.15)),.065,.14,'cream',parent=arm)
            if name=='pochita': ball('Pompom',(0,-.34,.04),.14,accent,arm)
        if name in ['joseba','josete']:
            box('Laptop',(0,-.18,.24),(.38,.25,.04),'charcoal',arms)
            box('LaptopLogo',(0,-.18,.265),(.09,.08,.015),accent,arms)
        if name=='intern': box('Backpack',(0,.52,-.23),(.34,.38,.18),'blue')
        if name=='manager':box('Tie',(0,.48,.161),(.075,.30,.02),'red')
    elif kind=='cat':
        body=group('Body',(0,.2,0));box('Fur',(0,0,0),(.26,.24,.52),color,body,.06)
        for x in [-.09,.09]:
            for z in [-.18,.18]:box('Paw',(x,-.13,z),(.08,.15,.09),'cream',body)
        tail=group('Tail',(0,.06,-.25),body);box('TailFur',(0,.17,0),(.065,.34,.065),color,tail)
        head=group('Head',(0,.39,.27));box('CatHead',(0,0,0),(.29,.24,.25),color,head,.04)
        for x in [-.095,.095]:
            box('Ear',(x,.16,-.025),(.09,.13,.08),color,head)
            box('EarPink',(x,.16,.019),(.045,.075,.012),'pink',head)
            box('CatEye',(x*.8,.025,.13),(.06,.065,.02),'green',head)
            box('CatPupil',(x*.8,.025,.143),(.018,.06,.01),'rubber',head)
        box('Muzzle',(0,-.06,.14),(.13,.07,.035),'cream',head);box('Nose',(0,-.025,.16),(.04,.025,.015),'pink',head)
    elif kind=='duck':
        box('DuckBody',(0,.32,0),(.72,.46,.92),'#ffd84a',r=.11)
        box('DuckHead',(0,.77,.3),(.48,.44,.48),'#ffd84a',r=.09)
        box('Beak',(0,.7,.62),(.3,.10,.25),'orange',r=.04)
        for x in [-.14,.14]:box('DuckEye',(x,.86,.545),(.08,.10,.025),'rubber',r=.015)
        for x in [-.39,.39]:box('Wing',(x,.35,0),(.10,.26,.50),'#efba36',r=.04)
        box('DuckTail',(0,.48,-.47),(.32,.18,.28),'#ffd84a',r=.05)
    elif kind=='roomba':
        k.cyl('RobotCase',at((0,.085,0)),.45,.13,'cream',vertices=32)
        k.cyl('RobotTop',at((0,.153,0)),.36,.02,'purple',vertices=32)
        box('RobotBumper',(0,.085,.41),(.5,.07,.06),'rubber')
        box('RobotLED',(0,.18,.19),(.12,.025,.06),'light')
        for x in [-.31,.31]:
            brush=group('Brush', (x,.035,.31))
            for angle in range(3):
                blade=box('BrushBlade',(0,0,0),(.26,.02,.035),'charcoal',brush)
                blade.rotation_euler.z=angle*math.tau/3
    elif kind in ['bug','boss']:
        scale=1 if kind=='bug' else 6
        body=group('Body');box('Shell',(0,.16,0),(.32,.22,.42),color,body,.06)
        box('BugHead',(0,.14,.25),(.24,.16,.16),'charcoal',body,.03)
        eyes=group('Eyes')
        for x in [-.07,.07]:
            box('Eye',(x,.18,.34),(.055,.055,.02),accent,eyes)
            box('Spot',(x,.275,-.03),(.065,.012,.07),'charcoal',body)
        legs=group('Legs',(0,.065,0))
        for x in [-.22,.22]:
            for z in [-.14,0,.14]:box('BugLeg',(x,0,z),(.19,.035,.04),'charcoal',legs)
        for c in k.root.children:c.location*=scale;c.scale*=scale
    # Authoring details stay attached to the original named animation pivots.
    if kind in ('human','ai'):
        skin=color if kind=='ai' else '#f1d9c5'
        box('Neck',(0,.76,0),(.18,.12,.18),skin,body,.035)
        box('JacketHem',(0,.315,.015),(.445,.045,.305),'charcoal',body,.012)
        box('JacketZip',(0,.5,.162),(.016,.31,.012),'metal',body,.003)
        box('ZipPull',(0,.64,.178),(.035,.055,.018),accent,body,.006)
        box('ChestPocket',(-.125,.475,.16),(.105,.095,.018),color,body,.006)
        box('PocketSeam',(-.125,.52,.173),(.115,.012,.013),accent,body,.003)
        box('PocketTab',(-.09,.5,.185),(.02,.025,.01),'cream',body,.002)
        for sign in (-1,1):
            collar=box('Collar',(sign*.105,.705,.12),(.16,.085,.12),'cream' if kind=='human' else accent,body,.012)
            tilt(collar,sign*18)
            arm=bpy.data.objects['Arm_L' if sign<0 else 'Arm_R']
            box('SleeveCuff',(0,-.215,.005),(.137,.045,.17),'cream' if kind=='human' else 'rubber',arm,.009)
            box('Thumb',(-sign*.062,-.265,.052),(.05,.065,.07),skin,arm,.014)
            box('KnuckleSeam',(0,-.29,.078),(.07,.008,.008),'#d1ac93' if kind=='human' else 'metal',arm,.002)
            leg=bpy.data.objects['Leg_L' if sign<0 else 'Leg_R']
            box('TrouserSeam',(sign*.072,-.12,0),(.009,.22,.11),'#475061',leg,.002)
            box('ShoeSole',(0,-.296,.035),(.176,.025,.268),'cream',leg,.008)
            box('SneakerToe',(0,-.255,.138),(.151,.055,.048),accent,leg,.012)
            for yy in (-.003,.027):
                box('ShoeLace',(0,-.209,.055+yy),(.092,.011,.012),'cream',leg,.003)
            box('ShoeHeel',(0,-.255,-.085),(.095,.043,.018),accent,leg,.005)
        if kind=='human':
            for x in (-.1,.1):
                box('EyeWhite',(x,.035,.216),(.073,.084,.023),'#fff9ee',eyes,.011)
                box('Pupil',(x+.009,.034,.232),(.033,.052,.013),'#252737',eyes,.007)
                box('EyeCatchlight',(x+.002,.05,.241),(.012,.015,.006),'#ffffff',eyes,.002)
                brow=box('Brow',(x,.1,.215),(.082,.018,.024),hair,head,.005)
                tilt(brow,(8 if x<0 else -8) if name in ('guide','pochita','intern') else (0 if name in ('librarian','manager') else (9 if x<0 else -3)))
            box('Nose',(0,-.012,.221),(.055,.055,.055),'#edc6a9',head,.016)
            for sign in (-1,1):
                box('Ear',(sign*.232,-.015,-.005),(.055,.11,.10),skin,head,.02)
                box('EarInner',(sign*.258,-.012,.012),(.012,.055,.05),'#dfa98d',head,.006)
                box('Cheek',(sign*.16,-.055,.206),(.048,.024,.012),'#eab39f',head,.006)
                box('SmileCorner',(sign*.06,-.083,.219),(.018,.031,.012),'#704d46',head,.004)
            box('Lip',(0,-.109,.214),(.08,.009,.012),'#d99b8f',head,.003)
            # Hair silhouettes vary, while familiar hats, hoods and original colours remain.
            if name in ('recruiter','cristian','manager'):
                tilt(box('SweptFringe',(-.07,.17,.17),(.30,.10,.12),hair,head,.026),-10)
                box('SidePart',(.105,.236,.08),(.018,.016,.27),'#9e7250' if name=='recruiter' else '#5d463c',head,.003)
                for sign in (-1,1):box('Sideburn',(sign*.20,.015,.12),(.045,.11,.10),hair,head,.01)
            elif name in ('qa','alex','josete','intern'):
                for j in range(3):
                    h=(.06,.12,.08)[j] if name!='qa' else (.11,.08,.035)[j]
                    tilt(box('HairTuft',(-.14+j*.13,.25+h/3,.06),(.16,h,.27),hair,head,.018),(-12+j*7))
                tilt(box('Fringe',(-.08,.14,.19),(.24,.12,.08),hair,head,.018),12)
            elif name=='librarian':
                ball('SilverBun',(0,.18,-.25),.105,hair,head)
                for sign in (-1,1):box('SilverTemple',(sign*.19,.05,.13),(.055,.18,.09),'#e9e8e6',head,.016)
            elif name=='pochita':
                for sign in (-1,1):
                    box('PonytailBand',(sign*.245,.15,-.07),(.075,.13,.14),'#fff0d6',head,.015)
                    box('HairRibbon',(sign*.28,.22,-.05),(.15,.055,.08),accent,head,.008)
                box('Fringe',(0,.14,.17),(.38,.105,.10),hair,head,.02)
            if name in ('guide','pablo'):
                box('CapSeam',(0,.298,.015),(.018,.01,.37),'cream',head,.002)
                box('CapButton',(0,.306,-.02),(.06,.018,.06),'cream',head,.007)
                box('CapPatch',(0,.24,.232),(.14,.06,.015),'cream',head,.005)
            if name in ('joseba','sysadmin','guide'):
                for sign in (-1,1):
                    box('HoodString',(sign*.08,.63,.177),(.012,.18,.014),'cream',body,.003)
                    box('StringAglet',(sign*.08,.535,.177),(.021,.04,.022),'metal',body,.005)
            if name in ('qa','cristian','librarian','manager'):
                for x in (-.1,.1):
                    for sign in (-1,1):box('GlassesSide',(x+sign*.078,.032,.246),(.018,.10,.021),'charcoal',head,.004)
                    box('LensGlint',(x-.025,.063,.25),(.035,.008,.007),'#bbd9e9',head,.002)
                for sign in (-1,1):box('GlassesTemple',(sign*.18,.055,.15),(.022,.025,.20),'charcoal',head,.004)
            if name in ('recruiter','cristian','qa','manager'):
                arm=bpy.data.objects['Arm_R']
                box('TabletRim',(0,-.26,.145),(.245,.315,.012),'metal',arm,.01)
                box('TabletDisplay',(0,-.25,.154),(.195,.235,.012),'#253d51',arm,.008)
                for j,width in enumerate((.13,.10,.145,.075)):
                    box('TabletText',(-.015,-.17-j*.041,.163),(width,.013,.006),accent if j==0 else '#b5d4db',arm,.002)
                box('TabletHome',(0,-.394,.157),(.034,.013,.008),'cream',arm,.004)
            if name in ('pablo','sysadmin'):
                arm=bpy.data.objects['Arm_R']
                k.cyl('CoffeeSurface',at((0,-.166,.15)),.053,.008,'#5c3323',vertices=12,parent=arm)
                for p,s in [((.086,-.24,.15),(.055,.023,.025)),((.111,-.21,.15),(.022,.07,.025)),((.086,-.178,.15),(.055,.023,.025))]:
                    box('MugHandle',p,s,'cream',arm,.008)
                box('MugLabel',(0,-.245,.216),(.055,.055,.009),accent,arm,.009)
            if name in ('joseba','josete'):
                for row in range(3):
                    for col in range(5):
                        box('LaptopKey',(-.12+col*.06,-.12-row*.04,.268),(.035,.018,.006),'#96b8c1',arms,.001)
                box('LaptopStatus',(.13,-.27,.268),(.025,.008,.007),'light',arms,.002)
            if name=='intern':
                box('BackpackPocket',(0,.47,-.332),(.27,.19,.05),'#2f5680',body,.02)
                box('PackZip',(0,.57,-.36),(.23,.012,.014),'metal',body,.003)
                for sign in (-1,1):
                    box('PackStrap',(sign*.145,.57,.17),(.045,.30,.024),'#2f5680',body,.009)
                    box('StrapBuckle',(sign*.145,.48,.19),(.052,.04,.018),'metal',body,.005)
                box('PackHandle',(0,.748,-.23),(.16,.035,.05),'#2f5680',body,.007)
            if name=='manager':
                box('TieKnot',(0,.68,.18),(.09,.075,.032),'red',body,.009)
                box('TieClip',(0,.53,.184),(.09,.013,.013),'metal',body,.003)
            if name=='librarian':
                arm=bpy.data.objects['Arm_L']
                box('ReadingBook',(0,-.22,.10),(.18,.25,.08),'#c9a063',arm,.012)
                box('BookPages',(0,-.22,.146),(.15,.22,.012),'paper',arm,.004)
                box('Bookmark',(.04,-.08,.145),(.025,.06,.014),'red',arm,.003)
        else:
            box('VisorFrame',(0,.005,.217),(.395,.285,.022),'charcoal',head,.028)
            box('VisorGlass',(0,.01,.232),(.345,.235,.012),'#1e3042',head,.02)
            for sign in (-1,1):
                eye_color=('#77e4ff' if sign<0 else '#d3a6ff') if name=='Gemini' else accent
                box('DisplayEye',(sign*.092,.044,.243),(.06,.074,.012),eye_color,eyes,.014)
                box('DisplayGlint',(sign*.092-.01,.062,.252),(.014,.018,.005),'#ffffff',eyes,.002)
                box('RobotTemple',(sign*.231,.03,-.01),(.036,.14,.22),'metal',head,.012)
                box('TempleLight',(sign*.253,.035,.04),(.012,.055,.09),accent,head,.004)
                box('RobotShoulder',(sign*.28,.63,0),(.15,.10,.20),accent,body,.02)
            box('DisplaySmile',(0,-.069,.244),(.11,.018,.012),accent,head,.004)
            for j in range(3):box('ChargeLevel',(-.09+j*.09,.56,.183),(.052,.032,.012),accent,body,.005)
            if name=='Claude':
                arm=bpy.data.objects['Arm_L']
                box('Notebook',(0,-.20,.10),(.23,.28,.07),'#e8d8bd',arm,.012)
                box('NotebookSpine',(-.106,-.20,.10),(.035,.28,.085),'#8c4835',arm,.006)
                for j in range(4):box('NotebookLine',(.018,-.12-j*.045,.14),(.15,.009,.006),'#a98b70',arm,.001)
                box('PocketPen',(-.12,.56,.194),(.018,.12,.018),'#f4e3d3',body,.003)
            if name=='ChatGPT':
                for sign in (-1,1):
                    box('HeadphonePad',(sign*.273,0,0),(.042,.18,.14),'rubber',head,.017)
                    box('HeadphoneInset',(sign*.298,0,.015),(.013,.10,.08),accent,head,.008)
                link('HeadsetMic',(-.27,-.06,.08),(-.15,-.12,.30),.014,'metal',head)
                box('MicFoam',(-.15,-.12,.30),(.06,.035,.035),'charcoal',head,.009)
            if name=='Gemini':
                box('ExplorationPack',(0,.54,-.20),(.31,.30,.13),'#6650bd',body,.03)
                for sign in (-1,1):
                    box('PackStripe',(sign*.10,.54,-.275),(.035,.22,.015),'#b7e9fc',body,.006)
            if name=='Qwen3':
                box('CapClip',(-.15,.253,.222),(.075,.035,.02),'metal',head,.005)
                arm=bpy.data.objects['Arm_L']
                box('WristConsole',(0,-.16,.105),(.135,.10,.045),'charcoal',arm,.01)
                box('WristReadout',(0,-.16,.132),(.09,.055,.012),accent,arm,.005)
                for j in range(3):box('UtilitySlot',(.15,.48-j*.05,.17),(.07,.017,.015),'cream',body,.003)
            if name=='Mistral':
                box('BeretStem',(0,.314,-.03),(.035,.055,.04),'charcoal',head,.009)
                box('ScarfWrap',(0,.735,.07),(.36,.09,.27),'#ffd66f',body,.018)
                tilt(box('ScarfTail',(-.15,.585,.19),(.10,.29,.035),'#ffd66f',body,.012),-9)
                for yy in (.49,.53):box('ScarfStripe',(-.17,yy,.213),(.075,.012,.012),'#b94c25',body,.003)
    elif kind=='cat':
        for x in (-.095,.095):
            box('EyeShine',(x*.8-.01,.046,.151),(.017,.02,.008),'#ffffff',head,.003)
            for j in range(2):
                link('Whisker',(x*.7,-.052-j*.025,.17),(x*2.1,-.045-j*.045,.17),.005,'#f9e7ce',head)
        box('Collar',(0,.30,.15),(.27,.045,.20),'#328c80',r=.012)
        box('CollarTag',(0,.275,.262),(.055,.06,.018),'gold',r=.009)
        for z in (-.16,0,.16):box('TabbyStripe',(0,.126,z),(.21,.015,.055),'#9d522e',body,.004)
        box('TailTip',(0,.305,0),(.067,.075,.067),'cream',tail,.015)
        for x in (-.09,.09):
            for z in (-.18,.18):
                for dx in (-.018,.018):box('PawToe',(x+dx,-.175,z+.045),(.014,.024,.018),'#aa754b',body,.003)
    elif kind=='duck':
        for sign in (-1,1):
            box('DuckEyeWhite',(sign*.14,.86,.556),(.105,.12,.022),'#fff8de',r=.02)
            box('DuckPupil',(sign*.14+.012,.86,.572),(.052,.073,.013),'rubber',r=.012)
            box('DuckEyeGlint',(sign*.14,.883,.581),(.019,.022,.007),'#ffffff',r=.004)
            tilt(box('DuckBrow',(sign*.14,.952,.544),(.11,.025,.025),'#a37822',r=.007),sign*12)
            box('Nostril',(sign*.073,.758,.655),(.027,.012,.037),'#b45f1c',r=.006)
            for j in range(3):box('WingFeather',(sign*.445,.29+j*.055,-.07+j*.09),(.018,.035,.24),'#ffd86d',r=.007)
            box('DuckFoot',(sign*.19,.075,.21),(.25,.06,.29),'orange',r=.025)
            for j in range(2):box('WebbedToe',(sign*.19-.065+j*.13,.075,.365),(.065,.05,.08),'orange',r=.015)
        box('BeakSmile',(0,.682,.751),(.245,.012,.012),'#ab6322',r=.004)
        box('ChestFeather',(0,.40,.47),(.38,.20,.018),'#ffe78b',r=.025)
    elif kind in ('bug','boss'):
        # Original direct children have already received the 1x / 6x scale.
        for sign in (-1,1):
            link('Feelers',(sign*.08,.20,.26),(sign*.12,.30,.30),.008,'charcoal',body)
            ball('FeelerTip',(sign*.12,.30,.30),.018,accent,body)
            box('EyeSpark',(sign*.07-.01,.192,.354),(.012,.014,.006),'#ffffff',eyes,.002)
            for z in (-.14,0,.14):
                link('LegJoint',(sign*.18,0,z),(sign*.28,.035,z+.035),.021,'#414558',legs)
                box('BugFoot',(sign*.30,-.022,z+.04),(.055,.045,.07),'rubber',legs,.009)
            box('ShellInset',(sign*.092,.275,-.055),(.105,.018,.21),accent if kind=='boss' else '#a82932',body,.01)
        box('ShellSeam',(0,.278,-.015),(.012,.012,.30),'charcoal',body,.003)
        box('ShellShine',(-.075,.286,-.10),(.045,.012,.07),'#edbdcb' if kind=='boss' else '#ffb1a2',body,.004)
        if kind=='boss':
            for x,h in ((-.07,.025),(0,.045),(.07,.025)):
                box('BossCrown',(x,.23+h/2,.26),(.045,h,.045),'gold',body,.007)
            for x in (-.065,.065):box('BossTooth',(x,.095,.335),(.035,.045,.028),'cream',body,.007)
    elif kind=='roomba':
        box('RobotFace',(0,.10,.449),(.29,.075,.018),'charcoal',r=.012)
        for sign in (-1,1):
            box('RobotEye',(sign*.075,.11,.462),(.04,.035,.008),'light',r=.007)
            box('SideWheel',(sign*.39,.055,-.03),(.09,.085,.20),'rubber',r=.014)
        box('RobotSmile',(0,.075,.461),(.05,.009,.007),'light',r=.002)
        k.cyl('LidarSocket',at((0,.18,-.10)),.09,.04,'metal',vertices=16)
        k.cyl('LidarCap',at((0,.205,-.10)),.07,.018,'purple',vertices=16)
        for x in (-.22,.22):
            for z in (-.22,.22):box('ServiceScrew',(x,.17,z),(.025,.01,.025),'metal',r=.005)
        box('DustbinLatch',(0,.17,-.30),(.16,.02,.045),'metal',r=.006)
        for j in range(3):box('BatteryTick',(-.06+j*.06,.17,.23),(.035,.012,.025),accent,r=.004)
    # Satin vinyl catches the studio light; microdetails need no extra bevel rings.
    for mat in set(k.mats.values()):
        shader=mat.node_tree.nodes.get('Principled BSDF')
        if shader and mat not in (k.mats['rubber'],k.mats['paper'],k.mats['metal']):
            shader.inputs['Roughness'].default_value=.38
            shader.inputs['Coat Weight'].default_value=.12
            shader.inputs['Coat Roughness'].default_value=.28
    for obj in subtree(k.root):
        for mod in obj.modifiers:
            if mod.type=='BEVEL':mod.segments=min(mod.segments,2)
    bpy.context.view_layer.update()
    triangles=0
    depsgraph=bpy.context.evaluated_depsgraph_get()
    for obj in subtree(k.root):
        if obj.type=='MESH':
            evaluated=obj.evaluated_get(depsgraph); mesh=evaluated.to_mesh()
            mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
    bpy.ops.object.select_all(action='DESELECT')
    for o in subtree(k.root):o.select_set(True)
    bpy.context.view_layer.objects.active=k.root
    bpy.ops.export_scene.gltf(filepath=str(WEB/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')),compress=True)
    return {'id':name,'file':name+'.glb','bytes':(WEB/(name+'.glb')).stat().st_size,'triangles':triangles,'source':str(OUT/(name+'.blend'))}

cast=[('recruiter','#ff4d8d','#ffd60a'),('guide','#3df2b0','#19e6ff'),('qa','#8b5cf6','#ff9f1c'),('sysadmin','#2f7bff','#19e6ff'),('intern','#e3a129','#c5e3ff'),('librarian','#6b4f3a','#c9a063'),('joseba','#2b2140','#ff7c35'),('pochita','#ff5fa2','#ffb6dd'),('alex','#1f2430','#3df2b0'),('josete','#3b7a57','#8cffb0'),('cristian','#7a3b6b','#ebacff'),('pablo','#b5542b','#ffd60a'),('manager','#e9edf5','#d7263d')]
report=[build(*args) for args in cast]
for n,c,a in [('Claude','#d97757','#f4e3d3'),('ChatGPT','#10a37f','#e9fff8'),('Gemini','#4c8df6','#b58cff'),('Qwen3','#6b4ef0','#d9d2ff'),('Mistral','#fa5310','#ffd60a')]:report.append(build(n,c,a,'ai'))
for n,c,a in [('cat','#e08a3c','#9beb88'),('duck','#ffd84a','#ff8a1e'),('bug','#e5352b','#97f583'),('boss','#9945a7','#ffbf42'),('roomba','#c4d5df','#85ffc3')]:report.append(build(n,c,a,n))
(WEB/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
# One editable, lit gallery contains the complete cast; individual files keep game-scale pivots.
bpy.ops.wm.read_factory_settings(use_empty=True)
gallery=Kit('Gallery',make_materials())
gallery.mats['studio']=material('CAST / studio','#b8c2d1',.72)
gallery.mats['plinth']=material('CAST / plinth','#f0eee7',.43)
gallery.mats['ink']=material('CAST / ink','#35425f',.5)
gallery.box('Studio floor',(0,3.5,-.22),(40,40,.25),'studio',.04)
roles={'recruiter':'TALENTO','guide':'EXPLORADOR','qa':'CALIDAD','sysadmin':'SISTEMAS','intern':'APRENDIZ','librarian':'ARCHIVO',
 'joseba':'CREADOR','pochita':'ENERGIA','alex':'EQUIPO','josete':'EQUIPO','cristian':'EQUIPO','pablo':'EQUIPO','manager':'DIRECCION',
 'Claude':'CUADERNO + VINILO','ChatGPT':'AURICULARES + MICRO','Gemini':'EXPLORADOR DUAL','Qwen3':'CONSOLA DE MUNECA','Mistral':'BOINA + BUFANDA',
 'cat':'RONRONEOS','duck':'DEBUGGING','bug':'BUG / x2.0','boss':'BOSS / x0.45','roomba':'LIMPIEZA'}
def flat_text(name,words,position,size):
    obj=gallery.text(name,words,position,size,'ink')
    obj.rotation_euler=(0,0,0)
    return obj
for i,item in enumerate(report):
    with bpy.data.libraries.load(item['source'],link=False) as (a,b): b.collections=['Actor']
    col=b.collections[0];bpy.context.scene.collection.children.link(col)
    x=(i%6-2.5)*2.2;y=(i//6)*2.7
    gallery.box('Display plinth',(x,y,-.04),(1.95,2.10,.16),'plinth',.07)
    for o in col.objects:
        if o.parent is None:
            o.location=(x,y+.1,.045)
            o.rotation_euler.z=math.radians(-8 if i%2==0 else 8)
            if item['id']=='boss':o.scale=(.45,.45,.45)
            elif item['id']=='bug':o.scale=(2,2,2)
            elif item['id']=='cat':o.scale=(1.4,1.4,1.4)
    flat_text('Name / '+item['id'],item['id'].upper(),(x,y-.68,.045),.155)
    flat_text('Role / '+item['id'],roles[item['id']],(x,y-.90,.045),.07)
flat_text('Cast title','KROQUETITA  /  EL REPARTO',(0,10,.01),.40)
flat_text('Cast subtitle','VINILO, PERSONALIDAD Y MUCHAS GANAS DE LIARLA',(0,9.57,.01),.14)
scene=bpy.context.scene
scene.world=bpy.data.worlds.new('Cast studio world')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.66,.86,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
light('Cast key',(-6,-4,11),(0,3,0),1800,(1,.88,.76),8,gallery.col)
light('Cast fill',(7,-1,8),(0,3,.5),1400,(.73,.86,1),7,gallery.col)
light('Cast rim',(0,10,9),(0,3,.5),2200,(1,.96,.84),6,gallery.col)
scene.camera=camera('Cast camera',(7,-13.5,16),(0,3.8,.15),50,gallery.col,ortho=16.5)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.cycles.use_denoising=True;scene.cycles.max_bounces=5
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(HERE/'cast-polished-preview.png')
scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=0
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_perspective='CAMERA'
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
scene['Cast revision']='Detailed toy-vinyl edition: original identities, scale and controller pivots'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kroquetita-cast.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
print('CAST_COMPLETE',len(report),sum(x['bytes'] for x in report),flush=True)
