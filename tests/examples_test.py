"""Check independent package composition without importing the PigmentLab studio.
Uses the built library closures and the authored browser example in an inline document.
python tests/examples_test.py [--chromium /usr/bin/chromium]
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--chromium')
args = p.parse_args()
source = (root / 'dist/pigmentlab.js').read_text()
# The studio and demo are deliberately excluded: only nine library closures are loaded.
libs = source.split('// app/demo.js')[0] + '\nwindow.PigmentLabPackages = modules;\n})();'

def imports_as_properties(js):
    return re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",
                  lambda m: 'const {' + re.sub(r'\s+as\s+', ':', m[1]) + '} = window.PigmentLabPackages[' + json.dumps(m[2]) + '];', js)

html = (root / 'examples/minimal-paint.html').read_text()
html = re.sub(r'<script type="importmap">[\s\S]*?</script>', '', html)
script = re.search(r'<script type="module">([\s\S]*?)</script>', html).group(1)
script = imports_as_properties(script)
script += '\nwindow.example = {engine,surface,renderer,view};'
html = re.sub(r'<script type="module">[\s\S]*?</script>', '', html)
html += '<script>' + libs.replace('</script', '<\\/script') + '</script>'
html += '<script>(async()=>{' + script.replace('</script', '<\\/script') + '})().catch(e=>window.exampleError=e.stack);</script>'

with sync_playwright() as pw:
    launch = dict(headless=True, args=['--no-sandbox'])
    if args.chromium:
        launch['executable_path'] = args.chromium
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport=dict(width=1024, height=768))
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html)
    page.wait_for_function('window.example || window.exampleError')
    assert page.evaluate('window.exampleError || null') is None
    assert page.evaluate('Object.keys(window.PigmentLabPackages).length') == 9
    assert page.evaluate('window.PigmentLab === undefined')  # Studio was never loaded.
    rect = page.locator('canvas').bounding_box()
    page.mouse.move(rect['x'] + rect['width'] * .25, rect['y'] + rect['height'] * .5)
    page.mouse.down()
    page.mouse.move(rect['x'] + rect['width'] * .7, rect['y'] + rect['height'] * .5, steps=20)
    page.mouse.up()
    mass = page.evaluate('async()=>Array.from(await example.surface.read()).filter((_,i)=>i%12===8||i%12===9).reduce((a,b)=>a+b,0)')
    assert mass > 0
    page.locator('#dry').click()
    water = page.evaluate('async()=>Array.from(await example.surface.read()).filter((_,i)=>i%12===3).reduce((a,b)=>a+b,0)')
    assert water == 0
    page.locator('#clear').click()
    assert page.evaluate('async()=>Array.from(await example.surface.read()).every(v=>v===0)')
    checks = imports_as_properties((root / 'tests/gpu-checks.js').read_text())
    checks = checks.replace('export async function runGPUChecks', 'async function runGPUChecks')
    page.add_script_tag(content='(()=>{' + checks + ';window.runGPUChecks=runGPUChecks;})();')
    gpu = page.evaluate('()=>runGPUChecks(document.querySelector("canvas"))')
    # about:blank inline contexts do not normally expose an adapter. Preserve the
    # actual status rather than recasting SKIPPED as GPU validation.
    assert gpu['status'] in ['SKIPPED', 'PASSED'], gpu
    assert not errors, errors
    report = dict(independentExample='PASSED', studioLoaded=False,
                  packageCount=9, pointerPaintMass=mass, dryAndClear='PASSED',
                  gpuHarness=gpu, browser=browser.version, errors=errors)
    (root / 'artifacts/examples-tests.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    browser.close()
