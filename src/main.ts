import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

// Global variables to store PWA launch data
declare global {
  interface Window {
    __pwaLaunchParams?: any;
    __onPwaLaunch?: (params: any) => void;
  }
}

// Set up the launch consumer early to capture parameters from the OS.
if ('launchQueue' in window) {
  console.log('[main.ts] Setting up launchQueue consumer...');
  (window as any).launchQueue.setConsumer((launchParams: any) => {
    console.log('[main.ts] launchQueue.setConsumer triggered with:', launchParams);
    
    // Store globally for the service to pick up
    window.__pwaLaunchParams = launchParams;
    
    // Call any registered callback if the service is already initialized
    if (window.__onPwaLaunch) {
      window.__onPwaLaunch(launchParams);
    }
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
