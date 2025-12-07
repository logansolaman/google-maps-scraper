// Popup script for managing UI and communication with content script

let scrapedData = [];
let isScraperActive = false;

const elements = {
  counter: document.getElementById('counter'),
  status: document.getElementById('status'),
  scrapeBtn: document.getElementById('scrapeBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  exportBtn: document.getElementById('exportBtn')
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
  const headers = ['Business Name', 'Category', 'Address', 'Phone', 'Website', 'Business Hours'];
  const csvRows = [headers.join(',')];
  
  // Add data rows
  data.forEach(item => {
    const row = [
      escapeCSV(item.name || ''),
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
