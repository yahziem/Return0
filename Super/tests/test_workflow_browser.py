from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path('/mnt/data/Super_La_Muneca_Firebase/public')
html=re.sub(r'<script[^>]*></script>','',re.sub(r'<link[^>]+>', '',(root/'index.html').read_text()))
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.add_style_tag(content=(root/'styles.css').read_text()+'\n'+(root/'dark.css').read_text())
  page.add_script_tag(content='''function cloudEnabled(){return false}
function cloudStatus(s){} function cloudSave(){} function cloudRetry(){}
function cloudInit(){document.getElementById('authGate').hidden=true;document.getElementById('app').hidden=false;render()}''')
  page.add_script_tag(content=(root/'app.js').read_text())
  page.locator('button[data-tab="inventory"]').click()
  page.locator('button[data-act="new-product"]').first.click()
  page.locator('#pBarcode').fill('07501234567890')
  page.locator('#pName').fill('Agua 1L')
  page.locator('#pCost').fill('7')
  page.locator('#pPrice').fill('12')
  page.locator('#pStock').fill('10')
  page.locator('#pMin').fill('3')
  page.locator('button[data-act="save-product"]').click()
  assert page.evaluate('db.products.length')==1
  assert page.evaluate('db.products[0].code')=='07501234567890'
  page.evaluate('closeModal();go("home");cashModal()')
  page.locator('#cashOpening').fill('100')
  page.locator('button[data-act="open-cash"]').click()
  assert page.evaluate('openSession().initial')==100
  page.locator('button.nav-item[data-tab="sell"]').click()
  page.locator('button[data-act="cart-add"]').first.click()
  page.locator('button[data-act="cart-add"]').first.click()
  page.locator('button[data-act="checkout"]').click()
  page.locator('#cashGiven').fill('50')
  page.locator('button[data-act="complete-sale"]').click()
  assert page.evaluate('db.sales.length')==1
  assert page.evaluate('db.products[0].stock')==8
  assert page.evaluate('cashExpected(openSession())')==124
  assert page.evaluate('db.sales[0].total')==24
  page.evaluate('closeModal(); go("home")')
  page.screenshot(path='/mnt/data/Super_La_Muneca_Firebase/vista_con_venta.png',full_page=True)
  assert not errors,errors
  print('OK: alta por código de barras (con cero inicial) → apertura de caja → venta 2 unidades → inventario 8 → efectivo esperado $124')
  print('OK: funcionamiento táctil en pantalla 390×844 sin errores JavaScript')
  browser.close()
