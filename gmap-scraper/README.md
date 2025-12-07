# Google Maps Scraper - Chrome Extension

A Chrome extension that scrapes business information from Google Maps search results.

## Features

- ✅ Automatic scrolling to load all available results
- ✅ Real-time counter showing number of scraped businesses
- ✅ Pause/Resume functionality
- ✅ Export data to CSV with timestamp
- ✅ Extracts: Business Name, Category, Address, Phone, Website, Business Hours

## Installation

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or click the three dots menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to and select the `gmap-scraper` folder
   - The extension should now appear in your extensions list

## Usage

1. **Navigate to Google Maps**
   - Go to [Google Maps](https://www.google.com/maps)
   - Search for businesses (e.g., "restaurants in New York")

2. **Open the Extension**
   - Click the extension icon in your Chrome toolbar
   - If you don't see it, click the puzzle piece icon and pin the extension

3. **Start Scraping**
   - Click the **"Scrape"** button
   - The extension will:
     - Automatically scroll through all results
     - Extract business information from each listing
     - Update the counter in real-time

4. **Pause/Resume (Optional)**
   - Click **"Pause"** to temporarily stop scraping
   - Click **"Resume"** to continue from where you left off

5. **Export Data**
   - Click **"Export"** to download a CSV file
   - File will be named: `export_YYYYMMDD_timestamp.csv`

## Extracted Data Fields

| Field | Description | Always Present |
|-------|-------------|----------------|
| Business Name | Name of the business | ✅ Yes |
| Category | Business category/type | ❌ Optional |
| Address | Full address | ❌ Optional |
| Phone | Phone number | ❌ Optional |
| Website | Website URL | ❌ Optional |
| Business Hours | Operating hours | ❌ Optional |

## CSV Output Format

```csv
Business Name,Category,Address,Phone,Website,Business Hours
"Joe's Pizza","Pizza restaurant","123 Main St, New York, NY","(555) 123-4567","https://joespizza.com","Open 24 hours"
"Bob's Burgers","Restaurant","456 Oak Ave, New York, NY","","",""
```

## Technical Details

### XPath Selectors Used

- **Listing Container**: `//div[@role="article"]`
- **Business Name**: `//div[@class="fontHeadlineSmall"]`
- **Category**: `//div[@role="article"]/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[1]/span[1]/span`
- **Address**: `//div[@role="article"]/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[1]/span[3]/span[2]`
- **Business Hours**: `//div[@role="article"]/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[2]/span[1]/span/span[2]`
- **Phone Number**: `//div[@role="article"]/div[2]/div[4]/div[1]/div/div/div[2]/div[4]/div[2]/span[2]/span[2]`
- **Website**: `//a[@data-value='Website']`

### Scrolling Behavior

- Scrolls with 3-second intervals to allow lazy loading
- Attempts up to 5 consecutive scrolls without new content before stopping
- Maximum 100 total scrolls to prevent infinite loops
- Shows progress during scrolling

## Troubleshooting

### Extension Not Working
- Make sure you're on a Google Maps search results page
- Refresh the page and try again
- Check that the extension has proper permissions

### No Data Scraped
- Ensure you're viewing search results, not a single business page
- Some businesses may not have all fields populated
- Google Maps structure may have changed (XPath selectors may need updating)

### Export Not Working
- Check that Chrome has download permissions
- Ensure popup blockers are not blocking the download

## Notes

- The extension only works on Google Maps search results pages
- Scraping may take several minutes for large result sets
- Google Maps may limit the number of results shown (typically 120-500)
- The extension respects the data structure as it appears on the page

## License

This extension is for educational purposes. Please use responsibly and in accordance with Google's Terms of Service.
