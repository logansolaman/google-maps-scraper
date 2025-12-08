// Background service worker for the extension

let isBatchScraping = false;

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

// Handle batch scrape requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startBatchScrape') {
    runBatchScrape(message.businessTypes);
    sendResponse({ success: true });
  }
  return true;
});

async function runBatchScrape(businessTypes) {
  if (isBatchScraping) return;
  isBatchScraping = true;
  
  const baseUrl = 'https://www.google.com/maps/place/Coventry,+UK/@52.4132815,-1.8267259,11z';
  
  for (let i = 0; i < businessTypes.length; i++) {
    const businessType = businessTypes[i];
    
    // Update progress in popup window
    updatePopupProgress(i + 1, businessTypes.length, businessType);
    
    try {
      // Create new tab with Coventry location (not active)
      const tab = await chrome.tabs.create({ url: baseUrl, active: false });
      
      // Wait for tab to load
      await waitForTabLoad(tab.id);
      
      // Wait for Maps to initialize
      await sleep(3000);
      
      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Wait for content script to load
      await sleep(500);
      
      // Perform search
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: searchForBusiness,
        args: [businessType]
      });
      
      // Wait for search to complete and results to load
      await sleep(5000);
      
      // Start scraping
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'startScraping' });
      
      if (response && response.success) {
        // Wait for scraping to complete
        await waitForScrapingComplete(tab.id);
        
        // Get the scraped data
        const dataResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getData' });
        
        if (dataResponse && dataResponse.data && dataResponse.data.length > 0) {
          // Export data with business type in filename
          exportToCSVWithName(dataResponse.data, businessType);
          console.log(`Scraped ${dataResponse.data.length} businesses for ${businessType}`);
        } else {
          console.log(`No results for ${businessType}, skipping...`);
        }
      } else {
        console.log(`Error scraping ${businessType}, skipping...`);
      }
      
      // Close the tab
      await chrome.tabs.remove(tab.id);
      
      // Small delay between business types
      await sleep(2000);
      
    } catch (error) {
      console.error(`Error processing ${businessType}:`, error);
      // Continue to next business type on error
    }
  }
  
  isBatchScraping = false;
  
  // Notify popup that batch scraping is complete
  updatePopupComplete();
}

function searchForBusiness(businessType) {
  // Find search input
  const searchInput = document.getElementById('searchboxinput');
  if (!searchInput) {
    console.error('Search input not found');
    return;
  }
  
  // Clear existing value
  searchInput.value = '';
  
  // Type the business type character by character
  let currentIndex = 0;
  const typeInterval = setInterval(() => {
    if (currentIndex < businessType.length) {
      searchInput.value += businessType[currentIndex];
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      currentIndex++;
    } else {
      clearInterval(typeInterval);
      
      // Press Enter after a short delay
      setTimeout(() => {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        searchInput.dispatchEvent(enterEvent);
      }, 300);
    }
  }, 50);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

async function waitForScrapingComplete(tabId) {
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      try {
        const state = await chrome.tabs.sendMessage(tabId, { action: 'getState' });
        if (state && !state.isActive) {
          clearInterval(checkInterval);
          resolve();
        }
      } catch (error) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function exportToCSVWithName(data, businessType) {
  if (data.length === 0) return;
  
  // Create CSV content
  const headers = ['Business Name', 'Rating', 'Review Count', 'Category', 'Address', 'Phone', 'Website', 'Business Hours'];
  const csvRows = [headers.join(',')];
  
  data.forEach(item => {
    const row = [
      escapeCSV(item.name || ''),
      escapeCSV(item.rating || ''),
      escapeCSV(item.reviewCount || ''),
      escapeCSV(item.category || ''),
      escapeCSV(item.address || ''),
      escapeCSV(item.phone || ''),
      escapeCSV(item.website || ''),
      escapeCSV(item.hours || '')
    ];
    csvRows.push(row.join(','));
  });
  
  const csvContent = csvRows.join('\n');
  
  // Generate filename
  const now = new Date();
  const datetime = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = now.getTime();
  const sanitizedBusinessType = businessType.replace(/[^a-z0-9]/gi, '_');
  const filename = `${sanitizedBusinessType}_${datetime}_${timestamp}.csv`;
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  });
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function updatePopupProgress(current, total, businessType) {
  try {
    const storage = await chrome.storage.local.get('popupWindowId');
    if (storage.popupWindowId) {
      chrome.runtime.sendMessage({
        action: 'batchProgress',
        current: current,
        total: total,
        businessType: businessType
      });
    }
  } catch (error) {
    console.error('Error updating popup progress:', error);
  }
}

async function updatePopupComplete() {
  try {
    chrome.runtime.sendMessage({
      action: 'batchComplete'
    });
  } catch (error) {
    console.error('Error updating popup complete:', error);
  }
}
