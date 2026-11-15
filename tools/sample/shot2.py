import asyncio, sys
from playwright.async_api import async_playwright
STEPS = [a.split(':', 1) for a in sys.argv[1:]]   # name:js
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        import os
        W,H = (390,844) if os.environ.get('PHONE') else (1280,900)
        pg = await b.new_page(viewport={'width':W,'height':H}, device_scale_factor=2 if os.environ.get('PHONE') else 1)
        logs=[]; pg.on('console', lambda m: logs.append(m.text)); pg.on('pageerror', lambda e: logs.append('ERR '+str(e)))
        await pg.goto('http://localhost:8765/index.html')
        await pg.wait_for_function('window.__ready===true', timeout=180000)
        for name, js in STEPS:
            await pg.evaluate(js); await pg.wait_for_timeout(9000)
            await pg.screenshot(timeout=180000, path=f'/home/claude/sample/s-{name}.png')
        print('\n'.join(l for l in logs if 'GPU stall' not in l)[:3000])
        await b.close()
asyncio.run(main())
