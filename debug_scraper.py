"""
Debug script to test Google Maps scraper and see page structure
"""

import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# Initialize Chrome driver
chrome_options = Options()
# Comment out headless to see what's happening
# chrome_options.add_argument("--headless")
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--disable-dev-shm-usage")
service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=chrome_options)

# Replace with your actual Google Maps URL
url = input("Enter your Google Maps URL: ")

try:
    driver.get(url)
    time.sleep(5)  # Wait longer to see the page
    
    # Save page source for inspection
    with open("page_source.html", "w", encoding="utf-8") as f:
        f.write(driver.page_source)
    print("✓ Page source saved to page_source.html")
    
    # Try to find location divs
    location_divs = driver.find_elements(By.CLASS_NAME, "Nv2PK")
    print(f"✓ Found {len(location_divs)} location divs with class 'Nv2PK'")
    
    # Try different container selectors
    selectors = [
        ("XPath: Results for", By.XPATH, "//div[contains(@aria-label, 'Results for')]"),
        ("XPath: role=feed", By.XPATH, "//div[@role='feed']"),
        ("XPath: m6QErb class", By.XPATH, "//div[contains(@class, 'm6QErb')]"),
        ("Class: m6QErb", By.CLASS_NAME, "m6QErb"),
    ]
    
    for name, by, selector in selectors:
        try:
            elements = driver.find_elements(by, selector)
            if elements:
                print(f"✓ Found {len(elements)} elements with {name}")
            else:
                print(f"✗ No elements found with {name}")
        except Exception as e:
            print(f"✗ Error with {name}: {e}")
    
    # Extract first location if available
    if location_divs:
        print("\n--- First Location Details ---")
        div = location_divs[0]
        try:
            title_element = div.find_element(By.CLASS_NAME, "hfpxzc")
            print(f"Title: {title_element.get_attribute('aria-label')}")
            print(f"URL: {title_element.get_attribute('href')}")
        except Exception as e:
            print(f"Error extracting title: {e}")
            
        try:
            rating = div.find_element(By.CLASS_NAME, "ZkP5Je")
            print(f"Rating: {rating.get_attribute('aria-label')}")
        except Exception as e:
            print(f"Rating not found or error: {e}")
    
    input("\nPress Enter to close browser...")
    
finally:
    driver.quit()
