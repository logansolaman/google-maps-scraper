// Background service worker for the extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Maps Scraper extension installed');
});

// Inject content script when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url.includes('google.com/maps')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script injected');
    } catch (error) {
      console.error('Failed to inject content script:', error);
    }
  }
});
