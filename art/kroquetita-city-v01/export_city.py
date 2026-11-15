"""Export independent districts and repair animated rest transforms in GLB."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Quaternion,Matrix
HERE=Path(__file__).resolve().parent; sys.path.insert(0,str(HERE))
from kit import subtree, camera,light,PILOT
sys.path.insert(0,str(PILOT))
from validate_assets import read_glb,encode_glb,accessor_values

def rest_transforms(objects):
    c=Quaternion((1,0,0),-math.pi/2)
    values={}
    for obj in objects:
        loc,rot,scale=obj.matrix_basis.decompose()
        q=c@rot@c.conjugated()
        values[obj.name]={'translation':[loc.x,loc.z,-loc.y],
            'rotation':[q.x,q.y,q.z,q.w], 'scale':[scale.x,scale.z,scale.y]}
    return values

def finalize(path,rest,root):
    raw,doc,chunks=read_glb(path)
    # Blender NLA export can omit a node's nonzero rest transform. Preserve the
    # assembled frame-150 pose without touching any keyframe or binary payload.
    animated={(ch['target']['node'],ch['target']['path']) for a in doc.get('animations',[]) for ch in a['channels']}
    for idx,prop in animated:
        node=doc['nodes'][idx]; name=node.get('name')
        if name in rest and prop in rest[name]:
            node.pop('matrix',None); node[prop]=rest[name][prop]
    path.write_bytes(encode_glb(doc,chunks))
    _,doc,chunks=read_glb(path)
    roots=doc['scenes'][doc.get('scene',0)]['nodes']
    assert len(roots)==1 and doc['nodes'][roots[0]]['name']==root.name,(path,roots)
    r=doc['nodes'][roots[0]]
    assert all(abs(v)<1e-5 for v in r.get('translation',[0,0,0]))
    assert all(abs(v-1)<1e-5 for v in r.get('scale',[1,1,1]))
    assert not doc.get('cameras') and 'KHR_lights_punctual' not in doc.get('extensions',{})
    assert all('uri' not in b for b in doc.get('buffers',[]))
    animations=[]
    for a in doc.get('animations',[]):
        ends=[]
        for s in a['samplers']:
            times=accessor_values(doc,chunks,s['input'])
            assert all(math.isfinite(float(v[0] if isinstance(v,(list,tuple)) else v)) for v in times)
            acc=doc['accessors'][s['input']]; ends.append(acc.get('max',[0])[0])
        animations.append({'name':a['name'],'duration_seconds':max(ends,default=0),'channels':len(a['channels'])})
    tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes',[]) for p in m['primitives'] if 'indices' in p)
    return {'file':path.name,'bytes':path.stat().st_size,'root':root.name,
      'mesh_objects':len(doc.get('meshes',[])),'triangles':tris,'animations':animations,
      'hooks':[n['name'] for n in doc['nodes'] if n.get('name','').startswith('Hook_')],
      'checks':['GLB 2.0 length','single identity root','embedded buffers','no cameras or lights','finite animation times','rest pose preserved']}

def main():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/'kroquetita-city.blend'))
    scene=bpy.context.scene; scene.frame_set(150)
    out=HERE/'exports'; out.mkdir(exist_ok=True)
    native=HERE/'districts'; native.mkdir(exist_ok=True)
    names=['transport','plaza','career','library','bugs','hangar','lab','factory','brain_inside','coffee_machine','avatar']
    manifest={'version':1,'units':'metres','up':'+Y','forward':'+Z','rest_pose_frame':150,'assets':{}}
    for name in names:
        print('EXPORTING',name,flush=True)
        root=bpy.data.objects['AvatarRoot' if name=='avatar' else 'CoffeeRoot' if name=='coffee_machine' else name+'_Root']
        old_parent=root.parent; old_basis=root.matrix_basis.copy()
        root.parent=None; root.matrix_basis=Matrix.Identity(4); bpy.context.view_layer.update()
        objects=subtree(root); rest=rest_transforms(objects)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        path=out/(name+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
          export_apply=True,export_yup=True,export_lights=False,export_cameras=False,
          export_extras=True,export_animations=True,export_animation_mode='NLA_TRACKS',
          export_frame_range=False,export_force_sampling=True,export_materials='EXPORT')
        record=finalize(path,rest,root)
        record['assembly_position_blender']=list(old_basis.translation)
        record['assembly_position_gltf']=[old_basis.translation.x,old_basis.translation.z,-old_basis.translation.y]
        record['assembly_parent']=old_parent.name if old_parent else None
        manifest['assets'][name]=record
        # Native district scene: local root, its own camera and lights.
        district=bpy.data.scenes.new('KROQUETITA / '+name)
        district.world=scene.world.copy(); district.render.engine='CYCLES'
        district.cycles.samples=32; district.cycles.use_denoising=True
        district.frame_start=1; district.frame_end=480; district.render.fps=24
        district.render.resolution_x=1200; district.render.resolution_y=1000
        district.view_settings.view_transform='AgX'
        col=bpy.data.collections.new('Asset / '+name); district.collection.children.link(col)
        for obj in objects: col.objects.link(obj)
        studio=bpy.data.collections.new('Preview lighting'); district.collection.children.link(studio)
        extent=80 if name=='transport' else 5 if name in ('avatar','coffee_machine') else 24
        district.camera=camera('District camera '+name,(extent*.6,-extent*.85,extent*.7),(0,0,0.8),50,studio,ortho=extent)
        light('District key '+name,(-8,-12,18),(0,0,0),3500,(1,.8,.6),10,studio)
        light('District rim '+name,(8,8,14),(0,0,0),5000,(.3,.7,1),8,studio)
        district.frame_set(150)
        bpy.data.libraries.write(str(native/(name+'.blend')),{district},fake_user=True,compress=True)
        bpy.data.scenes.remove(district)
        root.parent=old_parent; root.matrix_basis=old_basis
        scene.frame_set(150); bpy.context.view_layer.update()
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    print('KQ_EXPORTS_DONE',flush=True)

if __name__=='__main__': main()
