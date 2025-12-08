// Popup script for managing UI and communication with content script

let scrapedData = [];
let isScraperActive = false;
let businessTypes = [];
let isBatchScraping = false;

const elements = {
  counter: document.getElementById('counter'),
  status: document.getElementById('status'),
  scrapeBtn: document.getElementById('scrapeBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  exportBtn: document.getElementById('exportBtn'),
  csvFile: document.getElementById('csvFile'),
  batchScrapeBtn: document.getElementById('batchScrapeBtn'),
  progressSection: document.getElementById('progressSection'),
  progressLabel: document.getElementById('progressLabel'),
  currentBusiness: document.getElementById('currentBusiness')
};

// Load saved state when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getState' }, (response) => {
      if (response) {
        updateUI(response);
      }
    });
  }
});

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateCounter') {
    elements.counter.textContent = message.count;
    scrapedData = message.data;
  } else if (message.action === 'updateStatus') {
    updateStatus(message.status, message.isActive, message.isPaused);
  } else if (message.action === 'scrapingComplete') {
    elements.counter.textContent = message.count;
    scrapedData = message.data;
    updateStatus('Scraping completed!', false, false);
  }
});

// Scrape button
elements.scrapeBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('google.com/maps')) {
    updateStatus('Please navigate to Google Maps first', false, false);
    return;
  }
  
  chrome.tabs.sendMessage(tab.id, { action: 'startScraping' }, (response) => {
    if (response && response.success) {
      updateStatus('Scraping in progress...', true, false);
    } else {
      updateStatus('Error: ' + (response?.error || 'Unknown error'), false, false);
    }
  });
});

// Pause button
elements.pauseBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'togglePause' }, (response) => {
    if (response) {
      if (response.isPaused) {
        updateStatus('Paused', true, true);
        elements.pauseBtn.textContent = 'Resume';
      } else {
        updateStatus('Scraping in progress...', true, false);
        elements.pauseBtn.textContent = 'Pause';
      }
    }
  });
});

// CSV File Upload Handler
elements.csvFile.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    elements.batchScrapeBtn.disabled = true;
    return;
  }
  
  try {
    const text = await file.text();
    businessTypes = parseCSV(text);
    
    if (businessTypes.length > 0) {
      elements.batchScrapeBtn.disabled = false;
      updateStatus(`Loaded ${businessTypes.length} business types`, false, false);
    } else {
      elements.batchScrapeBtn.disabled = true;
      updateStatus('No business types found in CSV', false, false);
    }
  } catch (error) {
    console.error('Error reading CSV:', error);
    elements.batchScrapeBtn.disabled = true;
    updateStatus('Error reading CSV file', false, false);
  }
});

// Batch Scrape Button
elements.batchScrapeBtn.addEventListener('click', async () => {
  if (isBatchScraping) return;
  
  isBatchScraping = true;
  elements.batchScrapeBtn.disabled = true;
  elements.scrapeBtn.disabled = true;
  elements.csvFile.disabled = true;
  elements.progressSection.style.display = 'block';
  
  // Create a persistent window for the popup
  const popupWindow = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 380,
    height: 600,
    focused: true,
    top: 0,
    left: screen.width - 400
  });
  
  // Store window ID for later use
  chrome.storage.local.set({ popupWindowId: popupWindow.id });
  
  // Run batch scraping in background
  chrome.runtime.sendMessage({
    action: 'startBatchScrape',
    businessTypes: businessTypes
  });
  
  // Close the original popup
  window.close();
});

// Listen for batch scrape updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'batchProgress') {
    elements.progressLabel.textContent = `Progress: ${message.current} of ${message.total}`;
    elements.currentBusiness.textContent = `Scraping: ${message.businessType}`;
  } else if (message.action === 'batchComplete') {
    isBatchScraping = false;
    elements.batchScrapeBtn.disabled = false;
    elements.scrapeBtn.disabled = false;
    elements.csvFile.disabled = false;
    elements.progressSection.style.display = 'none';
    updateStatus('Batch scraping completed!', false, false);
  }
});

function parseCSV(text) {
  const lines = text.split('\n');
  const types = [];
  
  // Skip header row and process business types
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line !== 'Business Types') {
      types.push(line);
    }
  }
  
  return types;
}

// Export button
elements.exportBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'getData' }, (response) => {
    if (response && response.data && response.data.length > 0) {
      exportToCSV(response.data);
    } else {
      updateStatus('No data to export', false, false);
      setTimeout(() => {
        updateStatus('Ready to scrape', false, false);
      }, 2000);
    }
  });
});

function updateUI(state) {
  elements.counter.textContent = state.count || 0;
  scrapedData = state.data || [];
  updateStatus(state.status || 'Ready to scrape', state.isActive || false, state.isPaused || false);
}

function updateStatus(statusText, isActive, isPaused) {
  elements.status.textContent = statusText;
  elements.status.className = 'status';
  
  if (isActive) {
    if (isPaused) {
      elements.status.classList.add('paused');
      elements.scrapeBtn.disabled = true;
      elements.pauseBtn.disabled = false;
      elements.pauseBtn.textContent = 'Resume';
    } else {
      elements.status.classList.add('scraping');
      elements.scrapeBtn.disabled = true;
      elements.pauseBtn.disabled = false;
      elements.pauseBtn.textContent = 'Pause';
    }
  } else {
    if (statusText.includes('completed')) {
      elements.status.classList.add('completed');
    }
    elements.scrapeBtn.disabled = false;
    elements.pauseBtn.disabled = true;
    elements.pauseBtn.textContent = 'Pause';
  }
  
  isScraperActive = isActive;
}

function exportToCSV(data) {
  if (data.length === 0) {
    updateStatus('No data to export', false, false);
    return;
  }
  
  // Create CSV header
  const headers = ['Business Name', 'Rating', 'Review Count', 'Category', 'Address', 'Phone', 'Website', 'Business Hours'];
  const csvRows = [headers.join(',')];
  
  // Add data rows
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
  
  // Generate filename with datetime and timestamp
  const now = new Date();
  const datetime = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = now.getTime();
  const filename = `export_${datetime}_${timestamp}.csv`;
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (downloadId) {
      updateStatus(`Exported ${data.length} businesses`, false, false);
      setTimeout(() => {
        updateStatus('Ready to scrape', false, false);
      }, 2000);
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
