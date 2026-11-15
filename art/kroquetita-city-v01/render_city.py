"""Render the saved city with real ray-traced reflections, CPU capped at four threads."""
import bpy,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent; sys.path.insert(0,str(HERE))
from build_city import lighting
bpy.ops.wm.open_mainfile(filepath=str(HERE/'kroquetita-city.blend'))
s=bpy.context.scene; s.render.threads_mode='FIXED'; s.render.threads=4
s.cycles.samples=28; s.cycles.use_denoising=True
s.render.resolution_x=1500; s.render.resolution_y=1200
s.camera.data.ortho_scale=85
out=HERE/'previews'; out.mkdir(exist_ok=True)
for mode in ('golden','night','day'):
    lighting(s,mode)
    s.render.filepath=str(out/(mode+'.png'))
    print('RENDERING',mode,flush=True); bpy.ops.render.render(write_still=True)
s.camera=bpy.data.objects['CAM / factory']; s.camera.data.ortho_scale=18
s.render.resolution_x=1280; s.render.resolution_y=1100
lighting(s,'night'); s.render.filepath=str(out/'factory-night.png')
bpy.ops.render.render(write_still=True)
s.camera=bpy.data.objects['CAM / plaza']; s.camera.data.ortho_scale=15
lighting(s,'golden'); s.render.filepath=str(out/'plaza-golden.png')
bpy.ops.render.render(write_still=True)
print('KQ_RENDERS_DONE',flush=True)
