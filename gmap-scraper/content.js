// Content script for scraping Google Maps

class GoogleMapsScraper {
  constructor() {
    this.scrapedData = [];
    this.isActive = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.scrollAttempts = 0;
    this.maxScrollAttempts = 5;
    this.lastScrollHeight = 0;
  }
  
  cleanup() {
    // Clear all data and reset state
    this.scrapedData = [];
    this.isActive = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.scrollAttempts = 0;
    this.lastScrollHeight = 0;
    
    console.log('Scraper memory cleaned up');
    return { success: true };
  }

  async startScraping() {
    if (this.isActive) {
      return { success: false, error: 'Scraping already in progress' };
    }

    this.isActive = true;
    this.isPaused = false;
    this.scrapedData = [];
    this.currentIndex = 0;
    this.updateStatus('Scrolling to load all results...');

    try {
      // First, scroll to load all results
      await this.scrollToLoadAll();
      
      // Then scrape all listings
      await this.scrapeAllListings();
      
      this.isActive = false;
      this.sendMessage({
        action: 'scrapingComplete',
        count: this.scrapedData.length,
        data: this.scrapedData
      });
      
      return { success: true };
    } catch (error) {
      console.error('Scraping error:', error);
      this.isActive = false;
      this.updateStatus('Error: ' + error.message);
      return { success: false, error: error.message };
    }
  }

  async scrollToLoadAll() {
    const feedContainer = this.getFeedContainer();
    if (!feedContainer) {
      throw new Error('Could not find results container. Make sure you are on a Google Maps search page.');
    }

    this.lastScrollHeight = feedContainer.scrollHeight;
    let noChangeCount = 0;
    let scrollCount = 0;
    const maxScrolls = 100;

    while (scrollCount < maxScrolls && noChangeCount < this.maxScrollAttempts) {
      if (this.isPaused) {
        await this.waitForResume();
      }

      // Check if we've reached the end of the list
      if (this.hasReachedEndOfList(feedContainer)) {
        console.log('Reached end of list message detected');
        break;
      }

      // Scroll to bottom
      feedContainer.scrollTop = feedContainer.scrollHeight;
      
      // Wait for content to load
      await this.sleep(3000);
      
      const newHeight = feedContainer.scrollHeight;
      scrollCount++;
      
      if (newHeight === this.lastScrollHeight) {
        noChangeCount++;
        console.log(`No new content (${noChangeCount}/${this.maxScrollAttempts})`);
      } else {
        noChangeCount = 0;
        console.log(`Scroll ${scrollCount}: Loaded more results`);
        this.lastScrollHeight = newHeight;
      }
      
      // Update status with scroll progress
      const articles = document.querySelectorAll('div[role="article"]');
      this.updateStatus(`Loading results... (${articles.length} found)`);
    }

    console.log(`Scrolling complete. Total scrolls: ${scrollCount}`);
  }

  hasReachedEndOfList(container) {
    // Check if container contains the "You've reached the end of the list." message
    const endMessage = container.querySelector('span.HlvSq');
    if (endMessage && endMessage.textContent.includes("You've reached the end of the list.")) {
      return true;
    }
    return false;
  }

  getFeedContainer() {
    // Try multiple selectors for the scrollable container
    const selectors = [
      'div[role="feed"]',
      'div[aria-label*="Results for"]',
      'div.m6QErb'
    ];

    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        console.log(`Found feed container using selector: ${selector}`);
        return container;
      }
    }

    return null;
  }

  async scrapeAllListings() {
    const articles = document.querySelectorAll('div[role="article"]');
    console.log(`Found ${articles.length} listings to scrape`);
    
    this.updateStatus(`Scraping ${articles.length} listings...`);

    for (let i = 0; i < articles.length; i++) {
      if (this.isPaused) {
        await this.waitForResume();
      }

      const article = articles[i];
      const businessData = await this.scrapeArticle(article, i);
      
      if (businessData && businessData.name) {
        this.scrapedData.push(businessData);
        this.currentIndex = i + 1;
        
        // Update counter in real-time
        this.sendMessage({
          action: 'updateCounter',
          count: this.scrapedData.length,
          data: this.scrapedData
        });
      }

      // Small delay between listings to avoid overwhelming the page
      await this.sleep(100);
    }
  }

  async scrapeArticle(article, index) {
    try {
      const data = {
        name: '',
        rating: '',
        reviewCount: '',
        category: '',
        address: '',
        phone: '',
        website: '',
        hours: ''
      };

      // Business Name - REQUIRED
      const nameElement = article.querySelector('div.fontHeadlineSmall');
      if (!nameElement) {
        console.warn(`No name found for article ${index}`);
        return null;
      }
      data.name = nameElement.textContent.trim();

      // Rating
      const ratingElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[3]/div/span[2]/span/span[1]',
        article
      );
      if (ratingElement) {
        data.rating = ratingElement.textContent.trim();
      }

      // Review Count
      const reviewCountElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[3]/div/span[2]/span/span[2]',
        article
      );
      if (reviewCountElement) {
        data.reviewCount = reviewCountElement.textContent.trim();
      }

      // Click on the listing to load details
      const clickableElement = article.querySelector('a.hfpxzc');
      if (clickableElement) {
        clickableElement.click();
        await this.sleep(1500); // Wait for details panel to load
      }

      // Category
      const categoryElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[1]/span[1]/span',
        article
      );
      if (categoryElement) {
        data.category = categoryElement.textContent.trim();
      }

      // Address
      const addressElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[1]/span[3]/span[2]',
        article
      );
      if (addressElement) {
        data.address = addressElement.textContent.trim();
      }

      // Business Hours
      const hoursElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[2]/span[1]/span/span[2]',
        article
      );
      if (hoursElement) {
        data.hours = hoursElement.textContent.trim();
      }

      // Phone Number
      const phoneElement = this.getElementByXPath(
        './/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[2]/span[2]/span[2]',
        article
      );
      if (phoneElement) {
        data.phone = phoneElement.textContent.trim();
      }

      // Website - from the detail panel
      const websiteElement = this.getElementByXPath('//a[@data-tooltip="Open website"]');
      if (websiteElement) {
        data.website = websiteElement.href;
      }

      console.log(`Scraped: ${data.name}`);
      return data;

    } catch (error) {
      console.error(`Error scraping article ${index}:`, error);
      return null;
    }
  }

  getElementByXPath(xpath, contextNode = document) {
    const result = document.evaluate(
      xpath,
      contextNode,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.updateStatus('Scraping in progress...');
    }
    return { isPaused: this.isPaused };
  }

  async waitForResume() {
    while (this.isPaused) {
      await this.sleep(100);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateStatus(status) {
    this.sendMessage({
      action: 'updateStatus',
      status: status,
      isActive: this.isActive,
      isPaused: this.isPaused
    });
  }

  sendMessage(message) {
    chrome.runtime.sendMessage(message);
  }

  getState() {
    return {
      count: this.scrapedData.length,
      data: this.scrapedData,
      isActive: this.isActive,
      isPaused: this.isPaused,
      status: this.isActive ? (this.isPaused ? 'Paused' : 'Scraping in progress...') : 'Ready to scrape'
    };
  }

  getData() {
    return { data: this.scrapedData };
  }
}

// Create scraper instance
const scraper = new GoogleMapsScraper();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScraping') {
    scraper.startScraping().then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (message.action === 'togglePause') {
    const result = scraper.togglePause();
    sendResponse(result);
  } else if (message.action === 'getData') {
    const result = scraper.getData();
    sendResponse(result);
  } else if (message.action === 'getState') {
    const state = scraper.getState();
    sendResponse(state);
  } else if (message.action === 'cleanup') {
    const result = scraper.cleanup();
    sendResponse(result);
  }
  
  return true;
});

console.log('Google Maps Scraper content script loaded');
