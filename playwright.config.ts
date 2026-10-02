import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:'http://127.0.0.1:3041'},webServer:{command:'PORT=3041 DATA_FILE=data/e2e.json npm run dev',url:'http://127.0.0.1:3041/api/health',reuseExistingServer:false}});
