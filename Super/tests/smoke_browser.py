from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path('/mnt/data/Super_La_Muneca_Firebase/public')
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link[^>]+>', '', html)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html)
    page.add_style_tag(content=(root/'styles.css').read_text()+'\n'+(root/'dark.css').read_text())
    page.add_script_tag(content='''function cloudEnabled(){return false}
function cloudStatus(s){document.getElementById('cloudBadge').textContent=s}
function cloudSave(){}
function cloudRetry(){}
function cloudInit(){document.getElementById('authGate').hidden=true;document.getElementById('app').hidden=false;render()}
''')
    page.add_script_tag(content=(root/'app.js').read_text())
    page.wait_for_selector('text=Todo en orden')
    page.screenshot(path='/mnt/data/Super_La_Muneca_Firebase/vista_celular.png',full_page=True)
    assert page.locator('#authGate').is_hidden()
    assert page.locator('#app').is_visible()
    page.locator('button[data-tab="inventory"]').click()
    assert page.get_by_text('Mis productos').is_visible()
    page.locator('button[data-act="new-product"]').first.click()
    assert page.get_by_text('Nombre del producto').count()>=1
    page.locator('button[data-act="close"]').first.click()
    page.locator('button[data-tab="debts"]').click()
    assert not errors, errors
    print('OK: navegación móvil, modal producto, inventario y deudas sin excepciones')
    print('Vista:', '/mnt/data/Super_La_Muneca_Firebase/vista_celular.png')
    browser.close()
