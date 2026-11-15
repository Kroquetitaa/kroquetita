"""Bake the complete existing cast into editable, bevelled Blender models.
Y-up helper coordinates match the game's original joints and physics scale.
Run: blender --background --factory-startup --python build_cast.py
"""
import bpy, sys, json, math
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from kit import Kit, make_materials, subtree
OUT=HERE/'cast'; OUT.mkdir(exist_ok=True)
WEB=HERE/'cast/exports'; WEB.mkdir(parents=True,exist_ok=True)

def build(name,color='#7463a4',accent='#ffb347',kind='human'):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if not col.objects and not col.children: bpy.data.collections.remove(col)
    k=Kit('Actor',make_materials());k.root.name='Actor'
    def at(v): return (v[0],-v[2],v[1])
    def group(n,p=(0,0,0),parent=None): return k.empty(n,at(p),parent)
    def box(n,p,s,m,parent=None,r=.025): return k.box(n,at(p),(s[0],s[2],s[1]),m,min(r,min(s)*.3),parent)
    def ball(n,p,r,m,parent=None): return k.ball(n,at(p),r,m,1,parent)
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
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in subtree(k.root):o.select_set(True)
    bpy.context.view_layer.objects.active=k.root
    bpy.ops.export_scene.gltf(filepath=str(WEB/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')),compress=True)
    return {'id':name,'file':name+'.glb','bytes':(WEB/(name+'.glb')).stat().st_size,'source':str(OUT/(name+'.blend'))}

cast=[('recruiter','#ff4d8d','#ffd60a'),('guide','#3df2b0','#19e6ff'),('qa','#8b5cf6','#ff9f1c'),('sysadmin','#2f7bff','#19e6ff'),('intern','#e3a129','#c5e3ff'),('librarian','#6b4f3a','#c9a063'),('joseba','#2b2140','#ff7c35'),('pochita','#ff5fa2','#ffb6dd'),('alex','#1f2430','#3df2b0'),('josete','#3b7a57','#8cffb0'),('cristian','#7a3b6b','#ebacff'),('pablo','#b5542b','#ffd60a'),('manager','#e9edf5','#d7263d')]
report=[build(*args) for args in cast]
for n,c,a in [('Claude','#d97757','#f4e3d3'),('ChatGPT','#10a37f','#e9fff8'),('Gemini','#4c8df6','#b58cff'),('Qwen3','#6b4ef0','#d9d2ff'),('Mistral','#fa5310','#ffd60a')]:report.append(build(n,c,a,'ai'))
for n,c,a in [('cat','#e08a3c','#9beb88'),('duck','#ffd84a','#ff8a1e'),('bug','#e5352b','#97f583'),('boss','#9945a7','#ffbf42'),('roomba','#c4d5df','#85ffc3')]:report.append(build(n,c,a,n))
(WEB/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
# One editable gallery contains the complete cast; independent files remain convenient for changes.
bpy.ops.wm.read_factory_settings(use_empty=True)
for i,item in enumerate(report):
    with bpy.data.libraries.load(item['source'],link=False) as (a,b): b.collections=['Actor']
    col=b.collections[0];bpy.context.scene.collection.children.link(col)
    for o in col.objects:
        if o.parent is None:o.location=(i%6*3, -(i//6)*3, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kroquetita-cast.blend'),compress=True)
print('CAST_COMPLETE',len(report),sum(x['bytes'] for x in report),flush=True)
