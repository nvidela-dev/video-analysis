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
