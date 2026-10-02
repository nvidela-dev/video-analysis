import {test,expect} from '@playwright/test';
test('create transaction, review playable mock, update window and camera',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'+ Add transaction'}).click();await page.getByLabel('Amount',{exact:true}).fill('23.50');await page.getByLabel('Note',{exact:true}).fill('Browser sale');await page.getByRole('button',{name:'Save transaction'}).click();
 await page.getByRole('row').filter({hasText:'Browser sale'}).first().getByRole('link',{name:'Open →'}).click();await expect(page.getByRole('heading',{name:'Browser sale'})).toBeVisible();
 await expect(page.getByText('Synthetic demonstration footage.',{exact:false})).toBeVisible();
 await page.locator('video').evaluate(async(video:HTMLVideoElement)=>{await video.play();});await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Settings & cameras'}).click();await page.getByLabel('Seconds before').fill('15');await page.getByRole('button',{name:'Save window'}).click();await expect(page.getByRole('status')).toHaveText('Saved.');
 await page.getByRole('button',{name:'Edit',exact:true}).first().click();await page.getByLabel('Name',{exact:true}).fill('Edited counter');await page.getByRole('button',{name:'Save camera'}).click();await expect(page.locator('#cameras')).toContainText('Edited counter');
});
test('live controls pause polling, resume, label regions and prefill transaction',async({page})=>{
 let polls=0;const streams:string[]=[];
 await page.route('**/api/state',async route=>route.fulfill({json:{cameras:[{id:'testcam',name:'Test live',source:'frigate',register:'7',frigateName:'counter',offsetSeconds:0}],transactions:[],settings:{beforeSeconds:30,afterSeconds:30},frigateConfigured:true}}));
 await page.route('**/api/cameras/testcam/live',async route=>{polls++;await route.fulfill({json:{timestamp:new Date().toISOString(),limit:100,tracks:[{id:'1-aaa',start:Date.now()/1000-30,zonesVisited:['frame_left'],score:0.8},{id:'2-bbb',start:Date.now()/1000-5,zonesVisited:[],score:null}],recent:[{id:'1-aaa',start:Date.now()/1000-30,end:null,zonesVisited:['frame_left']}]}});});
 await page.route('**/api/cameras/testcam/stream?*',async route=>{streams.push(route.request().url());await route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});});
 await page.goto('/#live');await expect(page.locator('.live-count strong')).toHaveText('2');await expect(page.locator('.track-list')).toContainText('Left of frame');
 await page.getByLabel('Person boxes',{exact:true}).uncheck();await expect.poll(()=>streams.some(s=>s.includes('boxes=0'))).toBeTruthy();
 await page.getByRole('button',{name:'Pause view',exact:true}).click();const before=polls;await page.waitForTimeout(3300);expect(polls).toBe(before);await expect(page.locator('.stream-state')).toHaveText('View paused');
 await page.getByRole('button',{name:'Resume view'}).click();await expect.poll(()=>polls).toBeGreaterThan(before);
 await page.getByRole('button',{name:'Add transaction at this time'}).click();await expect(page.locator('#txDialog').getByLabel('Register',{exact:true})).toHaveValue('7');await expect(page.locator('#txForm input[name=timestamp]')).not.toHaveValue('');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('link',{name:'Transactions →'}).click();await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
});
