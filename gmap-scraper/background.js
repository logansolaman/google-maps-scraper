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
      // Create new tab with Coventry location (make it active so you can see it)
      const tab = await chrome.tabs.create({ url: baseUrl, active: true });
      
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
      await waitForSearchResults(tab.id);
      
      // Start scraping
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'startScraping' });
      
      if (response && response.success) {
        // Wait for scraping to complete
        await waitForScrapingComplete(tab.id);
        
        // Get the scraped data
        const dataResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getData' });
        
        console.log(`Data response for ${businessType}:`, dataResponse);
        
        if (dataResponse && dataResponse.data && dataResponse.data.length > 0) {
          // Export data with business type in filename
          console.log(`Exporting ${dataResponse.data.length} records for ${businessType}`);
          exportToCSVWithName(dataResponse.data, businessType);
        } else {
          console.log(`No results for ${businessType}, skipping...`);
        }
      } else {
        console.log(`Error scraping ${businessType}, skipping...`);
      }
      
      // Send cleanup message to content script before closing tab
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'cleanup' });
      } catch (error) {
        console.log('Tab already closed or cleanup failed');
      }
      
      // Close the tab
      await chrome.tabs.remove(tab.id).catch(err => console.log('Tab removal error:', err));
      
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
  let typeInterval = null;
  
  typeInterval = setInterval(() => {
    if (currentIndex < businessType.length) {
      searchInput.value += businessType[currentIndex];
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      currentIndex++;
    } else {
      if (typeInterval) {
        clearInterval(typeInterval);
        typeInterval = null;
      }
      
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
  
  // Cleanup interval after max time to prevent leaks
  setTimeout(() => {
    if (typeInterval) {
      clearInterval(typeInterval);
      typeInterval = null;
    }
  }, 10000); // 10 second failsafe
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
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes maximum
    const startTime = Date.now();
    
    const checkInterval = setInterval(async () => {
      try {
        // Check if we've exceeded maximum wait time
        if (Date.now() - startTime > maxWaitTime) {
          console.warn('Scraping timeout exceeded (5 minutes), moving to next business type');
          clearInterval(checkInterval);
          resolve();
          return;
        }
        
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

async function waitForSearchResults(tabId) {
  const maxWaitTime = 15000; // 15 seconds max
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // Check if results are loaded
          const feedContainer = document.querySelector('div[role="feed"]');
          const articles = document.querySelectorAll('div[role="article"]');
          return feedContainer && articles.length > 0;
        }
      });
      
      if (result && result[0] && result[0].result) {
        console.log('Search results loaded');
        await sleep(2000); // Additional buffer time
        return;
      }
    } catch (error) {
      console.log('Waiting for search results...');
    }
    
    await sleep(1000);
  }
  
  console.log('Search results wait timeout, proceeding anyway');
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
  
  // Create data URL (works better in service workers than blob URLs)
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  
  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false,
    conflictAction: 'uniquify'
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('Download error:', chrome.runtime.lastError);
    } else {
      console.log(`Downloaded: ${filename} (ID: ${downloadId})`);
    }
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
