"""Central public spaces, project demonstrators and cinematic souvenirs."""
import math
from kit import freeze_clip


def npc(k, name, loc, color='purple'):
    root=k.empty(name,loc)
    k.box(name+'_body',(0,0,.54),(.42,.30,.45),color,.04,root)
    k.box(name+'_head',(0,0,.96),(.44,.38,.42),'cream',.045,root)
    k.box(name+'_hair',(0,.02,1.16),(.46,.39,.08),'charcoal',.018,root)
    for x in (-.09,.09):
        k.box(name+'_eye',(x,-.198,1.0),(.045,.015,.055),'rubber',.003,root)
        k.box(name+'_boot',(x,-.04,.15),(.15,.32,.28),'charcoal',.025,root)
    k.box(name+'_smile',(0,-.199,.89),(.11,.014,.025),'orange',.004,root)
    for x in (-.27,.27):
        k.box(name+'_arm',(x,0,.53),(.12,.20,.40),color,.025,root)
    return root


def build_plaza(k,data):
    k.platform((12,8),'orange')
    # Two gateways frame the city while preserving sightlines to the skyline.
    for x in (-4.9,4.9):
        k.box('Entry pylon',(x,-2.9,1.4),(.45,.55,2.8),'cream',.06)
        k.box('Entry marker',(x,-3.19,1.8),(.24,.018,.75),'orange',.012)
    k.box('Welcome canopy',(0,-2.9,2.95),(10.35,.62,.22),'purple',.055)
    k.text('Welcome title','KROQUETITA',(0,-3.23,2.96),.42,'cream')
    k.cyl('Central plaza disc',(0,.7,.055),1.35,.11,'cream',vertices=48)
    k.cyl('Hologram table',(0,.7,.53),.66,.90,'purple',vertices=16)
    k.cyl('Hologram surface',(0,.7,1.01),.79,.08,'cyan',vertices=32)
    for i,(x,y) in enumerate([(-.35,.45),(.05,.40),(.36,.65),(-.18,.92),(.25,1.02)]):
        k.box('Miniature district',(x,y,1.10+i*.035),(.19,.19,.10+i*.07),['orange','lavender','blue','green','cream'][i],.012)
    k.hook('Hook_Map',(0,-.6,.8),'Open the route selector and fast travel')
    k.text('Map label','ELIGE TU AVENTURA',(0,-.07,.75),.13,'cream')
    for x in (-3.8,3.8):
        k.box('Bench seat',(x,2.25,.45),(2.1,.58,.12),'wood',.025)
        k.box('Bench back',(x,2.5,.85),(2.1,.12,.70),'purple',.035)
        for dx in (-.75,.75):
            k.box('Bench leg',(x+dx,2.25,.23),(.13,.40,.46),'charcoal',.015)
        k.box('Planter',(x,3.2,.35),(1.05,.65,.70),'cream',.05)
        for dx in (-.33,0,.33):
            k.ball('Plant crown',(x+dx,3.2,1.00),.32,'leaf')
    # Team corner and a physical hyperparameter arcade.
    k.cyl('Team table',(3.55,.25,.75),.85,.13,'cream',vertices=24)
    k.cyl('Team pedestal',(3.55,.25,.36),.18,.72,'purple')
    npc(k,'Team_Engineer',(2.4,.7,0),'blue')
    npc(k,'Team_Designer',(4.7,.65,0),'pink')
    k.hook('Hook_Team',(3.55,.25,1.1),'Team conversations')
    k.box('Training arcade',(-3.55,.25,.9),(1.25,.8,1.8),'lavender',.07)
    k.box('Training screen',(-3.55,-.16,1.18),(1.06,.035,.60),'charcoal',.025)
    for i,h in enumerate([.13,.28,.42,.23,.10]):
        k.box('Loss graph',(-3.95+i*.20,-.185,1.05+h/2),(.075,.018,h),'cyan',.01)
    k.box('Training control deck',(-3.55,-.34,.75),(1.30,.45,.13),'purple',.035)
    for x in (-3.9,-3.55,-3.2):
        k.cyl('Hyperparameter knob',(x,-.36,.85),.07,.09,'orange')
    k.text('Training title','ENTRENA TU MODELO',(-3.55,-.175,1.65),.10,'cream')
    k.hook('Hook_Training',(-3.55,-1.2,.8),'Open the existing model training minigame')
    # A time console gives the skyline animation a physical home.
    k.box('Time console',(0,3.0,.70),(2.45,.62,1.4),'charcoal',.07)
    k.text('Time console title','MAQUINA DEL TIEMPO',(0,2.67,1.13),.15,'cream')
    for i,year in enumerate(range(2021,2027)):
        x=-.95+i*.38
        k.text('Year_'+str(year),str(year),(x,2.67,.82),.10,'cyan')
    slider=k.empty('Time_Slider')
    k.box('Time pointer',(-.95,2.63,.63),(.13,.10,.12),'orange',.02,slider)
    slider.location.x=0
    slider.keyframe_insert(data_path='location',frame=1)
    slider.location.x=1.9
    slider.keyframe_insert(data_path='location',frame=150)
    freeze_clip(slider,'Time_2021_2026')
    k.hook('Hook_TimeMachine',(0,2.3,1),'Scrub career growth from 2021 to 2026')
    # Photo souvenir booth.
    k.box('Photo plinth',(4.5,-1.9,.25),(1.15,1,.5),'purple',.06)
    k.box('Photo kiosk',(4.5,-1.7,1.25),(.7,.50,1.50),'cream',.055)
    k.cyl('Photo lens',(4.5,-1.98,1.65),.15,.13,'charcoal',rotation=(math.pi/2,0,0))
    k.text('Photo title','MI EXPEDICION',(4.5,-1.97,1.1),.09,'purple')
    k.hook('Hook_Photo',(4.5,-2.7,.8),'Start a cinematic souvenir or photo')
    return {'hooks':['Hook_Map','Hook_Team','Hook_Training','Hook_TimeMachine','Hook_Photo'],
            'animations':['Time_2021_2026'],'notes':'Coffee and main avatar are shared standalone assets.'}


def build_hangar(k,data):
    k.platform((13,12),'cyan')
    # Open-front hangar: roof ribs suggest a building without hiding the demos.
    for y in (-4.2,0,4.2):
        for x in (-5.8,5.8):
            k.box('Hangar upright',(x,y,2.05),(.32,.36,4.1),'cream',.05)
            k.link('Hangar sloping roof',(x,y,4.05),(0,y,5.2),.11,'metal')
    k.box('Back screen',(0,5.25,2.0),(11.5,.20,4.0),'purple',.045)
    k.text('Hangar title','HANGAR DE PROYECTOS',(0,5.12,3.45),.44,'cream')
    k.text('Demo disclosure','DEMOSTRADORES / CASOS REALES POR INCORPORAR',(0,5.12,2.93),.13,'cyan')
    for x in (-5.7,5.7):
        k.link('Roof longitudinal rail',(x,-4.2,4.1),(x,4.2,4.1),.07,'cyan')
    demos=data.get('demos',[])
    defaults=[('load','ARQUITECTURA BAJO CARGA','cyan'),('agents','EQUIPO DE AGENTES','orange'),('data','DATOS CON CONTRATO','green')]
    hooks=[]
    for i,(identifier,title,color) in enumerate(defaults):
        x=-4.05+i*4.05
        root=k.empty('Demo_'+identifier,(x,0,0))
        k.box('Demo plinth',(0,0,.20),(3.35,4.7,.40),'charcoal',.08,root)
        k.box('Demo seam',(0,0,.42),(3.22,4.57,.06),color,.02,root)
        k.box('Demo console',(0,-2.05,.95),(2.95,.55,1.1),'purple',.04,root)
        k.text('Demo title',title,(0,-2.34,1.1),.11,'cream',root)
        k.text('Demo status','DEMO / ANTES - DESPUES',(0,-2.34,.85),.095,color,root)
        lever=k.empty('Lever_'+identifier,(.98,-2.1,1.58),root)
        k.link('Lever shaft',(0,0,0),(0,0,.38),.035,'metal',lever)
        k.ball('Lever knob',(0,0,.40),.095,color,2,lever)
        for f,a in [(1,-.45),(35,-.45),(60,.45),(96,.45)]:
            lever.rotation_euler.x=a
            lever.keyframe_insert(data_path='rotation_euler',frame=f)
        freeze_clip(lever,'Demo_Before_After')
        hook=k.hook('Hook_Demo_'+identifier,(x,-3.0,1),'Run '+identifier+' demonstrator')
        hooks.append(hook.name)
        if identifier=='load':
            for j in range(3):
                sx=-.93+j*.93
                k.box('Server tower',(sx,.65,1.1),(.66,.8,1.25),'cream',.035,root)
                for z in (.70,.95,1.20,1.45):
                    k.box('Server bay',(sx,.235,z),(.51,.025,.15),'charcoal',.009,root)
                    k.ball('Server LED',(sx+.19,.21,z),.025,color,1,root)
            k.box('Load balancer',(0,-.75,.78),(1.6,.55,.40),'blue',.035,root)
            for j in range(3):
                k.link('Load route',(0,-.45,.85),(-.93+j*.93,.14,.85),.025,color,root)
        elif identifier=='agents':
            for j,(ax,ay) in enumerate([(0,1.25),(-1,-.2),(1,-.2),(0,-1.1)]):
                k.box('Agent body',(ax,ay,.92),(.46,.45,.75),'cream',.04,root)
                k.box('Agent visor',(ax,ay-.235,1.1),(.34,.025,.22),color,.025,root)
                k.link('Agent route',(0,.25,.60),(ax,ay,.60),.035,color,root)
            k.ball('Orchestrator',(0,.25,1.85),.34,'orange',2,root)
        else:
            for j in range(4):
                k.cyl('Data store',(-1+j*.65,.85,.95),.22,.9,'cream',parent=root)
                k.cyl('Data store cap',(-1+j*.65,.85,1.42),.24,.08,color,parent=root)
            k.box('Validation gate',(0,-.25,1.13),(1.8,.16,.18),color,.025,root)
            for gx in (-.85,.85):
                k.box('Gate post',(gx,-.25,.81),(.13,.16,.65),'metal',.02,root)
            for j in range(5):
                k.box('Data record',(-1.05+j*.5,-1.05,.66),(.28,.38,.12),'red' if j==2 else 'green',.02,root)
            k.box('Quarantine bin',(1.10,1.8,.65),(.60,.60,.45),'red',.035,root)
    return {'hooks':hooks,'animations':['Demo_Before_After'],
            'notes':'Three demonstration machines mirror src/data/projects.ts; not asserted client case studies.'}
