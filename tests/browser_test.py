"""Real Chromium integration checks. pip install playwright; playwright install chromium.
Run against localhost (GPU when supported): python tests/browser_test.py --url http://localhost:4173/dist/
Policy-constrained local smoke mode: python tests/browser_test.py --inline --chromium /usr/bin/chromium
Inline mode runs CPU compatibility only; it is NOT evidence of GPU execution.
"""
import argparse
import json
import math
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--inline', action='store_true')
parser.add_argument('--url', default='http://localhost:4173/dist/')
parser.add_argument('--chromium')
args = parser.parse_args()
checks, errors, console_errors = [], [], []

def check(name, condition, details=None):
    result = {'name': name, 'pass': bool(condition)}
    if details is not None:
        result['details'] = details
    checks.append(result)
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, f'{name}: {details}'

with sync_playwright() as pw:
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if args.chromium:
        launch['executable_path'] = args.chromium
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={'width': 1600, 'height': 1050}, device_scale_factor=1)
    page.set_default_timeout(7000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('dialog', lambda d: d.accept())
    def state():
        return page.evaluate('PigmentLab.getState()')
    def invoke(command):
        return page.evaluate('(id) => PigmentLab.invoke(id)', command)
    def dialog_command(command):
        page.evaluate('(id) => { void PigmentLab.invoke(id); }', command)
        page.locator('dialog[open]').wait_for()
    def apply_dialog():
        page.locator('dialog[open] button[value="apply"]').click()
        page.wait_for_function('!document.querySelector("dialog") && !PigmentLab.app.busy')
    def world(x, y):
        return page.evaluate('''([x,y]) => {
            const v=PigmentLab.app.viewport,r=v.stage.getBoundingClientRect(),c=Math.cos(v.rotation),s=Math.sin(v.rotation);
            const dx=x-v.width/2,dy=y-v.height/2;
            return [r.left+r.width/2+v.panX+(dx*c-dy*s)*v.zoom,r.top+r.height/2+v.panY+(dx*s+dy*c)*v.zoom];
        }''', [x,y])
    def stroke(x1, y1, x2, y2, steps=12):
        a,b=world(x1,y1),world(x2,y2)
        page.mouse.move(*a)
        page.mouse.down()
        page.mouse.move(*b,steps=steps)
        page.mouse.up()
        page.wait_for_timeout(120)
    def tool(name):
        page.locator(f'[data-tool="{name}"]').click()
    def stats():
        return page.evaluate('''async()=>{
            PigmentLab.app.flushDabs();const f=await PigmentLab.app.active.surface.read();
            let mass=0,water=0,height=0,mask=0,hash=2166136261;
            const words=new Uint32Array(f.buffer);
            for(let i=0;i<f.length;i+=12){mass+=f[i+8]+f[i+9];water+=f[i+3];height+=f[i+7];mask+=f[i+11];}
            for(const value of words)hash=Math.imul(hash^value,16777619)>>>0;
            return {mass,water,height,mask,hash,finite:f.every(Number.isFinite)};
        }''')
    try:
        if args.inline:
            page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load')
        else:
            page.goto(args.url,wait_until='load')
        page.wait_for_function('window.PigmentLab?.app.ready')
        page.wait_for_timeout(700)
        initial=state()
        check('Application boot and three editable sample layers', initial['ready'] and len(initial['layers'])==3)
        check('Nine independent package exports are present', page.evaluate('Object.keys(PigmentLab.packages).filter(x=>!x.endsWith("/app")&&!x.endsWith("/demo")).length')==9)
        check('Sample pigment fields are nonzero and finite', stats()['mass']>10 and stats()['finite'])
        page.screenshot(path=str(OUT/'desktop-dark.png'))
        invoke('theme')
        check('Light theme switches at runtime',page.locator('html').get_attribute('data-theme')=='light')
        page.screenshot(path=str(OUT/'desktop-light.png'))
        invoke('theme')
        page.set_viewport_size({'width':390,'height':844})
        page.wait_for_timeout(300)
        check('Mobile layout does not overflow horizontally',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.screenshot(path=str(OUT/'mobile.png'))
        invoke('brush-panel')
        check('Mobile brush drawer opens',page.locator('.left-panel').evaluate('(e)=>e.classList.contains("open")'))
        invoke('color-panel')
        check('Mobile pigment drawer opens exclusively',page.locator('.right-panel').evaluate('(e)=>e.classList.contains("open")') and not page.locator('.left-panel').evaluate('(e)=>e.classList.contains("open")'))
        invoke('color-panel')
        page.set_viewport_size({'width':1600,'height':1050})
        page.wait_for_timeout(200)
        dialog_command('new')
        page.locator('dialog [name="name"]').fill('Integration study')
        page.locator('dialog [name="width"]').fill('128')
        page.locator('dialog [name="height"]').fill('128')
        apply_dialog()
        check('New-document dialog creates requested editable dimensions',state()['width']==128 and state()['simulationWidth']==128 and len(state()['layers'])==1)
        invoke('pause')
        check('Simulation pause toggles',state()['simulation']['paused'])
        stroke(20,30,105,45)
        painted=stats()
        check('Real mouse input deposits wet pigment',painted['mass']>0 and painted['water']>0)
        invoke('undo')
        check('Undo restores exact empty fields',stats()['mass']==0)
        invoke('redo')
        check('Redo restores exact IEEE-754 fields',stats()['hash']==painted['hash'])
        invoke('dry')
        check('Dry transfers pigment without deleting it',stats()['water']==0 and abs(stats()['mass']-painted['mass'])<1e-4)
        invoke('wet')
        check('Wet adds water to material fields',stats()['water']>5000)
        invoke('dry')
        tool('eraser')
        before=stats()['mass']
        stroke(20,30,105,45)
        check('Eraser removes actual material',stats()['mass']<before)
        invoke('clear')
        tool('mask')
        stroke(20,45,105,45)
        check('Masking fluid writes the resist channel',stats()['mask']>0)
        invoke('mask-clear')
        check('Remove masking fluid clears resist channel',stats()['mask']==0)
        tool('rect')
        stroke(10,10,45,45)
        check('Rectangle selection is rasterized',state()['selection']['type']=='rect')
        tool('paint')
        stroke(80,80,115,100)
        check('Selection rejects paint outside its bounds',stats()['mass']==0)
        stroke(16,22,38,30)
        check('Selection permits paint inside its bounds',stats()['mass']>0)
        invoke('deselect')
        check('Deselect restores full editing area',state()['selection'] is None)
        invoke('clear')
        page.locator('[data-medium="oil"]').click()
        stroke(25,30,105,90)
        check('Oil brush creates impasto',stats()['height']>0)
        before=stats()
        invoke('flip-x')
        invoke('flip-x')
        check('Double horizontal flip preserves exact material state',stats()['hash']==before['hash'])
        invoke('layer-duplicate')
        check('Duplicate layer copies all material channels',len(state()['layers'])==2 and stats()['hash']==before['hash'])
        row=page.locator('.layer-row.selected .layer-name')
        row.dblclick()
        page.locator('dialog [name="name"]').fill('Impasto copy')
        apply_dialog()
        check('Native double-click layer rename works',state()['layers'][-1]['name']=='Impasto copy')
        invoke('layer-down')
        check('Layer ordering is editable',state()['layers'][0]['name']=='Impasto copy')
        invoke('layer-up')
        page.locator('.layer-row.selected .visibility').click()
        page.wait_for_function('!PigmentLab.app.busy')
        check('Layer visibility toggles',not state()['layers'][-1]['visible'])
        page.locator('.layer-row.selected .visibility').click()
        page.wait_for_function('!PigmentLab.app.busy')
        page.locator('#layer-opacity').fill('65')
        page.locator('#layer-opacity').press('Tab')
        page.wait_for_function('!PigmentLab.app.busy')
        check('Layer opacity applies',state()['layers'][-1]['opacity']==.65)
        page.locator('#layer-blend').select_option('multiply')
        page.wait_for_function('!PigmentLab.app.busy')
        check('Layer blend mode applies',state()['layers'][-1]['blend']=='multiply')
        page.locator('.layer-row.selected .lock-layer').click()
        page.wait_for_function('!PigmentLab.app.busy')
        locked=stats()['hash']
        stroke(20,60,90,60)
        check('Locked layer rejects brush input',stats()['hash']==locked)
        page.locator('.layer-row.selected .lock-layer').click()
        page.wait_for_function('!PigmentLab.app.busy')
        invoke('layer-add')
        invoke('alpha-lock')
        stroke(20,60,90,60)
        check('Alpha lock rejects paint on transparent cells',stats()['mass']==0)
        invoke('alpha-lock')
        tool('fill')
        stroke(60,60,60,60,1)
        check('Contiguous fill adds material to a blank layer',stats()['mass']>100)
        invoke('undo')
        check('Fill participates in document undo',stats()['mass']==0)
        dialog_command('brush-settings')
        page.locator('dialog [name="name"]').fill('Integration bristle')
        apply_dialog()
        check('Brush creator adds a reusable preset',state()['brush']['name']=='Integration bristle' and page.locator('[data-preset]').count()>=4)
        dialog_command('mix')
        page.locator('dialog #mix-b').fill('#f2d753')
        apply_dialog()
        check('Pigment-mixing palette selects its computed mixture',state()['color']!='#538caf')
        dialog_command('paper-settings')
        page.locator('dialog [name="tint"]').fill('#eee8dc')
        apply_dialog()
        check('Paper properties affect the engine substrate',page.evaluate('PigmentLab.app.engine.paperSettings.tint')=='#eee8dc')
        tool('paint')
        stroke(20,30,100,70)
        roundtrip=page.evaluate('''async()=>{
            const a=PigmentLab.app,d=PigmentLab.packages['@pigmentlab/document'];
            a.doc.simulation.paused=true;
            window.savedSnapshot=await d.captureDocument(a.doc);
            window.savedBlob=await d.encodeProject(savedSnapshot);
            const decoded=await d.decodeProject(savedBlob);
            const fields=d.materializeSnapshot(decoded),original=d.materializeSnapshot(savedSnapshot);
            return fields.every((f,i)=>new Uint32Array(f.buffer).every((v,k)=>v===new Uint32Array(original[i].buffer)[k]));
        }''')
        check('Browser project serialization is bit-exact across all layers',roundtrip)
        invoke('clear')
        page.evaluate('''async()=>{
            const a=PigmentLab.app,d=PigmentLab.packages['@pigmentlab/document'];
            await a.restore(await d.decodeProject(savedBlob));
        }''')
        check('Saved project reopens with editable fields',stats()['mass']>0 and len(state()['layers'])==3)
        exports=page.evaluate('''async()=>{
            const r=PigmentLab.packages['@pigmentlab/renderer'],a=PigmentLab.app,out=[];
            for(const type of ['image/png','image/jpeg','image/webp']){
                const blob=await r.exportImage(a.renderer,a.doc.layers,{type});
                const bitmap=await createImageBitmap(blob);out.push({type:blob.type,size:blob.size,w:bitmap.width,h:bitmap.height});bitmap.close();
            }
            return out;
        }''')
        check('PNG, JPEG, and WebP exports decode at requested canvas resolution',all(e['type']==t and e['w']==128 and e['h']==128 and e['size']>100 for e,t in zip(exports,['image/png','image/jpeg','image/webp'])),exports)
        height=page.evaluate('''async()=>{
            const r=PigmentLab.packages['@pigmentlab/renderer'];const b=await r.heightmap(PigmentLab.app.active.surface),im=await createImageBitmap(b);const out={type:b.type,width:im.width,height:im.height};im.close();return out;
        }''')
        check('Heightmap exports a material-resolution PNG',height=={'type':'image/png','width':128,'height':128})
        imported=page.evaluate('''async()=>{
            const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#ba4868';ctx.fillRect(0,0,32,32);
            const blob=await new Promise(resolve=>c.toBlob(resolve));const file=new File([blob],'test-import.png',{type:'image/png'});
            await PigmentLab.app.importImage(file);return PigmentLab.getState().layers.length;
        }''')
        check('Raster image import creates a pigment layer',imported==4 and stats()['mass']>0)
        dialog_command('layer-delete')
        apply_dialog()
        check('Layer deletion applies through confirmation',len(state()['layers'])==3)
        invoke('undo')
        check('Undo restores deleted layer and data',len(state()['layers'])==4 and stats()['mass']>0)
        # Exercise actual browser download and input-file flows, not only serialization helpers.
        with page.expect_download() as saved:
            page.locator('.top-actions [data-command="save"]').click()
        project=saved.value
        project_path=OUT/'integration-roundtrip.pigment'
        project.save_as(str(project_path))
        check('Save button downloads an editable .pigment file',project_path.stat().st_size>100 and project.suggested_filename.endswith('.pigment'))
        invoke('clear')
        page.locator('#open-file').set_input_files(str(project_path))
        page.locator('dialog[open]').wait_for()
        apply_dialog()
        page.wait_for_function('document.getElementById("save-status").textContent === "Project opened"')
        check('File picker restores a downloaded project',len(state()['layers'])==4 and stats()['mass']>0)
        dialog_command('export')
        page.locator('dialog [name="transparent"]').check()
        with page.expect_download() as exported:
            apply_dialog()
        png_path=OUT/'integration-export.png'
        exported.value.save_as(str(png_path))
        check('Export dialog downloads a real PNG',png_path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
        page.locator('#reference-file').set_input_files(str(png_path))
        page.wait_for_function('document.getElementById("reference-image").complete && document.getElementById("reference-image").naturalWidth > 0')
        check('Reference image loads into the pinned panel',page.locator('#reference-card').is_visible())
        page.locator('#close-reference').click()
        check('Reference panel can be closed',not page.locator('#reference-card').is_visible())
        with page.expect_download() as brush_file:
            invoke('brush-export')
        brush_path=OUT/'integration.brush.json'
        brush_file.value.save_as(str(brush_path))
        old_id=state()['brush']['id']
        page.locator('#brush-file').set_input_files(str(brush_path))
        page.wait_for_function('(id)=>PigmentLab.app.brush.id!==id',arg=old_id)
        check('Brush JSON export/import preserves the editable preset',state()['brush']['name']=='Integration bristle')
        before_view=state()['view']
        invoke('rotate-right')
        check('Canvas rotation changes only the view',state()['view']['rotation']!=before_view['rotation'])
        invoke('reset-view')
        page.locator('#stage').focus()
        page.keyboard.press('e')
        check('Keyboard tool shortcuts dispatch',state()['tool']=='eraser')
        if page.evaluate('typeof MediaRecorder !== "undefined" && !!PigmentLab.app.renderer.canvas.captureStream'):
            invoke('record')
            tool('paint')
            stroke(15,60,110,75)
            page.wait_for_timeout(600)
            with page.expect_download() as recording:
                invoke('record')
            movie=OUT/'integration-process.webm'
            recording.value.save_as(str(movie))
            check('Painting process records to a nonempty browser-encoded video',movie.stat().st_size>100)
        check('No unhandled JavaScript exceptions',not errors,errors)
        check('No unexpected browser console errors',not console_errors,console_errors)
        print(json.dumps({'checks':len(checks),'backend':initial['backend'],'gpuExecuted':initial['backend']=='webgpu'}),flush=True)
    except Exception:
        page.screenshot(path=str(OUT/'browser-failure.png'))
        raise
    finally:
        report={'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'inline':args.inline,'errors':errors,'consoleErrors':console_errors,'gpuExecuted':page.evaluate('window.PigmentLab?.app?.engine?.kind==="webgpu"')}
        (OUT/'browser-tests.json').write_text(json.dumps(report,indent=2))
        browser.close()
