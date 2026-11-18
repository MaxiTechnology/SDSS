import {defineConfig} from '@playwright/test';
if(!/^sdss_browser_test_[0-9a-f]{32}$/.test(process.env.SDSS_BROWSER_TEST_SCHEMA??''))throw Error('Start live tests with backend/run_browser_journey.py.');
export default defineConfig({
 testDir:'./tests-live',timeout:360000,expect:{timeout:30000},workers:1,retries:0,
 outputDir:'test-results/live',reporter:'list',
 use:{baseURL:'http://127.0.0.1:5174',channel:'chrome',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
});
