"""Run once from Blender's console to follow the explicitly requested live build.
Only generated project files are opened. Unregisters after the final stage.
"""
import bpy,json
from pathlib import Path
FOLDER=Path(r'C:/Users/kroquetita/Desktop/kroquetita/art/kroquetita-city-v01')
seen=[0]
def show_next_stage():
    marker=FOLDER/'live.json'
    if marker.exists():
        data=json.loads(marker.read_text(encoding='utf-8'))
        if data['stage']>seen[0]:
            seen[0]=data['stage']
            bpy.ops.wm.open_mainfile(filepath=data['path'])
            if seen[0]>=9: return None
    return 3.0
bpy.app.timers.register(show_next_stage,first_interval=3,persistent=True)
