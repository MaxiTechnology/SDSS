import {test as base,expect} from '@playwright/test';
export const test=base.extend<{signedIn:void}>({signedIn:[async({page},use)=>{
 await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{id:'00000000-0000-4000-8000-000000000001',username:'test-admin',display_name:'Test Administrator',role:'administrator',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},csrf_token:'a'.repeat(64),setup_required:false}}));await use();
},{auto:true}]});
export {expect};
