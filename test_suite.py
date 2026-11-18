import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

ROOT_DIR = r"C:\Users\velur\projects\virinchi\campus-stores"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SCREENSHOT_DIR = os.path.join(ROOT_DIR, "docs", "screenshots")

async def send_cdp(ws, method, params=None, msg_id=[1]):
    mid = msg_id[0]
    msg_id[0] += 1
    req = {"id": mid, "method": method, "params": params or {}}
    await ws.send(json.dumps(req))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == mid:
            return resp.get("result", {})

async def eval_js(ws, expr):
    res = await send_cdp(ws, "Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": True
    })
    if "exceptionDetails" in res:
        raise Exception(f"JS Exception: {res['exceptionDetails']}")
    return res.get("result", {}).get("value")

async def capture_screenshot(ws, filename, width, height, dark=False):
    await send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 1,
        "mobile": width <= 450
    })
    await send_cdp(ws, "Emulation.setEmulatedMedia", {
        "media": "screen",
        "features": [{"name": "prefers-color-scheme", "value": "dark" if dark else "light"}]
    })
    await asyncio.sleep(0.3)
    res = await send_cdp(ws, "Page.captureScreenshot", {"format": "png"})
    data = base64.b64decode(res["data"])
    out_path = os.path.join(SCREENSHOT_DIR, filename)
    with open(out_path, "wb") as f:
        f.write(data)
    print(f"Captured: {filename} ({width}x{height}, dark={dark})")

async def run_tests():
    # Start Chrome headless
    chrome_proc = subprocess.Popen([
        CHROME_PATH,
        "--headless=new",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "--no-first-run",
        "--hide-scrollbars",
        "about:blank"
    ])
    await asyncio.sleep(1.5)

    try:
        # Get websocket debugger URL
        with urllib.request.urlopen("http://127.0.0.1:9222/json") as resp:
            tabs = json.loads(resp.read().decode())
            ws_url = tabs[0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=20*1024*1024) as ws:
            # Enable Runtime and Page
            await send_cdp(ws, "Runtime.enable")
            await send_cdp(ws, "Page.enable")
            await send_cdp(ws, "DOM.enable")

            # Navigate to index.html
            file_url = "file:///" + ROOT_DIR.replace("\\", "/") + "/index.html"
            print("Navigating to:", file_url)
            await send_cdp(ws, "Page.navigate", {"url": file_url})
            await asyncio.sleep(1)

            # Check for console errors
            title = await eval_js(ws, "document.title")
            print("Page title:", title)
            assert "Campus Stores" in title

            # ================================================================
            # Phase 0: Fri 3:45 pm
            # ================================================================
            print("\n--- PHASE 0: Fri 3:45 pm ---")
            phase_text = await eval_js(ws, "document.querySelector('[data-clock]').textContent")
            print("Desk time:", phase_text)
            assert "Friday · 3:45 pm" in phase_text

            # Initial screenshot (Requests list)
            await capture_screenshot(ws, "phase0_1100_light_requests.png", 1100, 750, dark=False)
            await capture_screenshot(ws, "phase0_1100_dark_requests.png", 1100, 750, dark=True)
            await capture_screenshot(ws, "phase0_650_requests.png", 650, 750, dark=False)
            await capture_screenshot(ws, "phase0_360_requests.png", 360, 750, dark=False)

            # Click view RQ-214
            await eval_js(ws, "document.querySelector('[data-action=\"request\"][data-val=\"RQ-214\"]').click()")
            await asyncio.sleep(0.3)

            # Verify RQ-214 kit details and bin labels (A2, B1, C4)
            walk_text = await eval_js(ws, "document.querySelector('.pick-slip-summary') ? document.querySelector('.pick-slip-summary').innerText : ''")
            print("Pick slip walk order:", walk_text)
            assert "Bin A2" in walk_text and "Bin B1" in walk_text and "Bin C4" in walk_text

            await capture_screenshot(ws, "phase0_1100_light_kit_builder.png", 1100, 850, dark=False)
            await capture_screenshot(ws, "phase0_1100_dark_kit_builder.png", 1100, 850, dark=True)

            # Batch issue kit to Kabir Sen
            await eval_js(ws, "document.querySelector('form[data-batch-issue]').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))")
            await asyncio.sleep(0.3)

            # Verify 3 slips were created and request is now "All issued"
            req_status = await eval_js(ws, "document.querySelector('.request-card-header .badge').textContent")
            print("RQ-214 status after batch issue:", req_status)
            assert "All issued" in req_status or "3/3 on loan" in req_status
            await capture_screenshot(ws, "phase0_1100_kit_issued.png", 1100, 850, dark=False)

            # Switch to Inventory and verify items on loan
            await eval_js(ws, "document.querySelector('[data-action=\"tab\"][data-val=\"Inventory\"]').click()")
            await asyncio.sleep(0.3)
            inv_text = await eval_js(ws, "document.querySelector('[data-page]').innerText")
            assert "PR-04" in inv_text and "On loan" in inv_text
            assert "SP-02" in inv_text and "On loan" in inv_text
            assert "AD-12" in inv_text and "On loan" in inv_text
            print("Inventory verified: PR-04, SP-02, AD-12 are On loan!")
            await capture_screenshot(ws, "phase0_1100_inventory.png", 1100, 800, dark=False)

            # Switch to Loan register and verify slips
            await eval_js(ws, "document.querySelector('[data-action=\"tab\"][data-val=\"Loan register\"]').click()")
            await asyncio.sleep(0.3)
            reg_text = await eval_js(ws, "document.querySelector('[data-page]').innerText")
            assert "L-402" in reg_text and "L-403" in reg_text and "L-404" in reg_text
            print("Loan register verified: L-402, L-403, L-404 exist!")

            await capture_screenshot(ws, "phase0_1100_loan_tickets.png", 1100, 800, dark=False)

            # ================================================================
            # Phase 1: Fri 7:30 pm
            # ================================================================
            print("\n--- PHASE 1: Fri 7:30 pm ---")
            # Advance shift
            await eval_js(ws, "document.querySelector('[data-action=\"advance\"]').click()")
            await asyncio.sleep(0.3)
            phase1_text = await eval_js(ws, "document.querySelector('[data-clock]').textContent")
            print("Desk time:", phase1_text)
            assert "Friday · 7:30 pm" in phase1_text

            # Verify items are NOT overdue at 7:30 pm
            overdue_check = await eval_js(ws, "document.querySelector('.outstanding-strip').innerText")
            print("Strip status at 7:30 pm:", overdue_check)
            assert "All on time" in overdue_check

            # Return projector (PR-04, L-402) and speaker (SP-02, L-403)
            await eval_js(ws, "document.querySelector('[data-action=\"return\"][data-val=\"402\"]').click()")
            await asyncio.sleep(0.2)
            await eval_js(ws, "document.querySelector('[data-action=\"return\"][data-val=\"403\"]').click()")
            await asyncio.sleep(0.2)

            # Reassign adapter (AD-12, L-404) to Leela Das
            await eval_js(ws, "document.querySelector('[data-action=\"open-reassign\"][data-val=\"404\"]').click()")
            await asyncio.sleep(0.2)
            await eval_js(ws, "document.querySelector('form[data-reassign] select[name=\"holder\"]').value = 'Leela Das'")
            await eval_js(ws, "document.querySelector('form[data-reassign] textarea[name=\"note\"]').value = 'Leela Das has adapter, dropping at 9 am tomorrow.'")
            await capture_screenshot(ws, "phase1_1100_reassign_drawer.png", 1100, 800, dark=False)
            await eval_js(ws, "document.querySelector('form[data-reassign]').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))")
            await asyncio.sleep(0.3)

            # Check that AD-12 displays Leela Das and the note
            ad_slip_text = await eval_js(ws, "document.querySelector('[data-page]').innerText")
            print("ad_slip_text after reassign:\n", ad_slip_text)
            assert "Leela Das" in ad_slip_text
            assert "originally Kabir Sen" in ad_slip_text
            assert "Reassigned" in ad_slip_text
            assert "Leela Das has adapter" in ad_slip_text
            assert "Leela Das has adapter" in ad_slip_text
            print("Slip L-404 successfully reassigned to Leela Das with handover note!")

            await capture_screenshot(ws, "phase1_1100_light_reassigned.png", 1100, 800, dark=False)
            await capture_screenshot(ws, "phase1_1100_dark_reassigned.png", 1100, 800, dark=True)

            # ================================================================
            # Phase 2: Sat 9:00 am
            # ================================================================
            print("\n--- PHASE 2: Sat 9:00 am ---")
            await eval_js(ws, "document.querySelector('[data-action=\"advance\"]').click()")
            await asyncio.sleep(0.3)
            phase2_text = await eval_js(ws, "document.querySelector('[data-clock]').textContent")
            print("Desk time:", phase2_text)
            assert "Saturday · 9:00 am" in phase2_text

            # CRITICAL CHECK: Overdue status
            strip_sat = await eval_js(ws, "document.querySelector('.outstanding-strip').innerText")
            print("Sat 9 am Outstanding strip:", strip_sat)
            assert "1 OVERDUE" in strip_sat

            # Check ticket L-404 (AD-12) vs ticket L-401 (MI-09 Tara's mic)
            ad_is_overdue = await eval_js(ws, "document.querySelector('.loan-ticket.is-overdue') ? true : false")
            print("AD-12 marked is-overdue:", ad_is_overdue)
            assert ad_is_overdue == True

            # Check that Tara's mic (due Sat 10 am) is NOT overdue
            all_tickets = await eval_js(ws, "Array.from(document.querySelectorAll('.loan-ticket')).map(t => ({ num: t.querySelector('.ticket-number').textContent, overdue: t.classList.contains('is-overdue'), text: t.innerText }))")
            for t in all_tickets:
              print(f"Ticket {t['num']}: Overdue={t['overdue']}")
              if t['num'] == 'L-401':
                assert t['overdue'] == False, "Tara's mic must NOT be overdue at 9 am!"
              if t['num'] == 'L-404':
                assert t['overdue'] == True, "AD-12 must be overdue at 9 am!"

            await capture_screenshot(ws, "phase2_1100_light_overdue.png", 1100, 800, dark=False)
            await capture_screenshot(ws, "phase2_1100_dark_overdue.png", 1100, 800, dark=True)
            await capture_screenshot(ws, "phase2_650_overdue.png", 650, 800, dark=False)
            await capture_screenshot(ws, "phase2_360_overdue.png", 360, 800, dark=False)

            # Close slip for AD-12
            await eval_js(ws, "document.querySelector('[data-action=\"return\"][data-val=\"404\"]').click()")
            await asyncio.sleep(0.3)
            post_return_strip = await eval_js(ws, "document.querySelector('.outstanding-strip').innerText")
            print("After returning AD-12:", post_return_strip)
            assert "All on time" in post_return_strip

            # Test Undo Return
            await eval_js(ws, "document.querySelector('.toast-undo-btn') ? document.querySelector('.toast-undo-btn').click() : document.querySelector('[data-action=\"undo-return\"][data-val=\"404\"]').click()")
            await asyncio.sleep(0.3)
            undo_strip = await eval_js(ws, "document.querySelector('.outstanding-strip').innerText")
            print("After undoing return:", undo_strip)
            assert "1 OVERDUE" in undo_strip
            print("Undo return verified!")

            # Return it again to leave clean finish
            await eval_js(ws, "document.querySelector('[data-action=\"return\"][data-val=\"404\"]').click()")
            await asyncio.sleep(0.3)

            # View All Slips
            await eval_js(ws, "document.querySelector('[data-action=\"scope\"][data-val=\"1\"]').click()")
            await asyncio.sleep(0.3)
            await capture_screenshot(ws, "phase2_1100_all_slips.png", 1100, 800, dark=False)

            # Check Desk book
            await eval_js(ws, "document.querySelector('[data-action=\"tab\"][data-val=\"Desk book\"]').click()")
            await asyncio.sleep(0.3)
            desk_text = await eval_js(ws, "document.querySelector('[data-page]').innerText")
            assert "Leela Das" in desk_text
            print("Desk book contains handover notes!")
            await capture_screenshot(ws, "phase2_deskbook.png", 1100, 800, dark=False)

            # ================================================================
            # Backward Compatibility Test
            # ================================================================
            print("\n--- BACKWARD COMPATIBILITY TEST ---")
            old_data = {
                "version": 1,
                "tab": "Loan register",
                "phase": 0,
                "selected": "",
                "filter": "All items",
                "loans": [
                    {
                        "num": 401,
                        "req": "RQ-209",
                        "asset": "MI-09",
                        "who": "Tara Shah",
                        "due": "Sat 10 am",
                        "back": False
                    }
                ],
                "notes": [],
                "editing": False,
                "onlyOpen": True,
                "notice": "Old format"
            }
            res = await eval_js(ws, f"""
                localStorage.setItem('{storageKey}', JSON.stringify({json.dumps(old_data)}));
                location.reload();
            """)
            await asyncio.sleep(1)
            reloaded_text = await eval_js(ws, "document.querySelector('[data-page]').innerText")
            assert "L-401" in reloaded_text and "Tara Shah" in reloaded_text
            print("Old format save restored cleanly and flawlessly!")

            print("\nALL VERIFICATIONS AND SCREENSHOTS COMPLETED SUCCESSFULLY!")

    finally:
        chrome_proc.terminate()

if __name__ == "__main__":
    storageKey = "campus-stores.shift.v1"
    asyncio.run(run_tests())
